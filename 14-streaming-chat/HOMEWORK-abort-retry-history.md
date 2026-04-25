# 作业 · Abort / Retry 引发的 history 污染

> 这是 Lesson 14 **Step 6 的延伸讨论**。
> README 里只讲了 abort/retry 的"工作机制",没讨论它对**服务端 `state.chatHistory`** 的副作用。
> 这个文件把副作用摊开给你看,然后给你三个修复方向,挑一个动手改。

---

## 为什么要关心这个?

前端 abort 的直观理解是:"停止显示"。但 Lesson 14 的后端是**有状态的** —— 每次
`POST /api/chat/stream` 都读 / 写 `state.chatHistory`,这份 history 是**下一轮请求发给
OpenAI 的 `input`**。

**abort 不会回滚已经写进去的 history。**

于是"UI 看到的历史" 和 "服务端下一次发给模型的历史"会不一致。下一次提问,模型看到的
上下文和你以为的不一样 —— 这不是显示 bug,是**模型行为 bug**。

---

## 三个关键代码事实

**事实 1 —— user message 在请求刚到就 push 进 history**
`server/server.ts:107`

```ts
state.chatHistory.push({ role: "user", content: message });
```

还没开始流、也没做任何异常检查,就直接 push 了。

---

**事实 2 —— assistant 文本只在"整轮结束且没 tool call"那一支 push**
`server/server.ts:261-266`

```ts
if (!hadToolCall) {
  if (text.length > 0) {
    state.chatHistory.push({ role: "assistant", content: text });
  }
  return;
}
```

Abort 时抛 `AbortError` → 被 `isAbortError(err)` 捕获 → 直接 `return`
(`server.ts:131-135`),累积在**局部变量 `text`** 里的那半截内容**永远不会**进 history。

---

**事实 3 —— function_call 和 function_call_output 是"原子配对 push"**
`server/server.ts:226-243`

```ts
case "response.output_item.done": {
  if (ev.item.type === "function_call") {
    const parsed = safeParseJSON(ev.item.arguments ?? "{}");
    const result = await runTool(ev.item.name, parsed);

    // 关键:两条一起 push,中间不会被打断
    state.chatHistory.push(ev.item as ResponseInputItem);
    state.chatHistory.push({
      type: "function_call_output",
      call_id: ev.item.call_id,
      output: JSON.stringify(result),
    } as ResponseInputItem);

    write("tool_result", { id: ev.item.id, result });
  }
  break;
}
```

- `output_item.done` 之前,参数 delta 只进**局部 `pending` Map**,不进 history
- `output_item.done` 到来时,function_call 和 function_call_output **一起** push
- 中间的 `await runTool(...)` 即使遇到 abort 信号,当前事件体仍会跑完
  —— `AbortSignal` 只影响下一次 `for await` 拿新事件

这是个**好不变量**:本 lab 不可能出现"有 function_call 但没有 function_call_output 的
孤儿"。记住这点,后面作业第 1 方向要靠它。

---

## 📚 官方文档的背书

上面三个事实不是本课拍脑袋定的,在 OpenAI 2026 Responses API 官方文档里都有对应说法。

### 1. Tool calling 是 5 步流程,第 4 步 = **必须** 把 tool output 送回模型

出自 [Function calling 指南 — The tool calling flow](https://developers.openai.com/api/docs/guides/function-calling):

> 1. Make a request to the model with tools it could call
> 2. Receive a tool call from the model
> 3. Execute code on the application side with input from the tool call
> **4. Make a second request to the model with the tool output**
> 5. Receive a final response from the model (or more tool calls)

换句话说,有了 function_call 就必须把 output 送回去 —— 这是流程契约,不是"可选优化"。

### 2. `function_call_output` 必须引用对应的 `call_id`

同一份指南里对 tool call output 的定义:

> The tool call output ... **should contain a reference to a specific model tool call
> (referenced by `call_id` in the examples to come)**.

这就是事实 3 里"原子配对 push"之所以用 `call_id` 做纽带的原因 —— 官方契约就是
"一条 function_call_output 精确挂在某一条 function_call 的 call_id 上"。

### 3. function_call 相关 item 要原样传回

[Reasoning models 指南 — Keeping reasoning items in context](https://developers.openai.com/api/docs/guides/reasoning#keeping-reasoning-items-in-context):

> ensure **all items between the last user message and your function call output
> are passed into the next response untouched**.

注意 **untouched** —— 不删、不改、不重排。本 lab 的
`state.chatHistory.push(ev.item as ResponseInputItem)` 把原样的 function_call item
塞进去,正是这条约束的最小实现。

---

## Abort 三种时机的 history 快照

假设之前已经聊过一轮:

```js
chatHistory = [
  { role: "user", content: "你好" },
  { role: "assistant", content: "你好!" },
]
```

### 情况 A · 纯文字流一半 abort(无 tool)

> 用户输入 "介绍一下北京" → 模型开始流 "北京是中华人民共" → 用户点停止

**UI 显示**:user 气泡 + assistant 气泡 `"北京是中华人民共"`(状态 `aborted`,带光标 ▋)

**服务端 `state.chatHistory`**:

```js
[
  { role: "user", content: "你好" },
  { role: "assistant", content: "你好!" },
  { role: "user", content: "介绍一下北京" },  // ← 事实 1:刚到请求就 push
  // ↑ 没有 assistant!累积在 text 局部变量里的半截字被丢了(事实 2)
]
```

UI 以为对话里有 4 条消息,服务端 history 只有 3 条。

---

### 情况 B · Tool 参数填一半 abort

> 用户输入 "Tokyo 天气怎么样?" → 模型发 function_call、参数流到 `{"city":"Tok` → 用户点停止

**UI 显示**:user 气泡 + 空 assistant 气泡 + ToolBubble 显示 `get_weather({"city":"Tok` (aborted)

**服务端 `state.chatHistory`**:

```js
[
  ...,
  { role: "user", content: "Tokyo 天气怎么样?" },
  // ↑ 什么 function_call 都没有!
  //   参数 delta 只进了局部 pending Map,output_item.done 还没来就 abort 了
  //   根据事实 3 的原子性,整对都没 push
]
```

---

### 情况 C · Tool 已完成、最终 assistant 文本中途 abort ⭐

> 用户输入 "Tokyo 天气怎么样?" → 模型完整产出 function_call `{"city":"Tokyo"}`
> → server 本地 `runTool` 得到 `{temp:18, condition:"sunny"}`,**配对 push 进 history**
> → 进入下一轮 agent loop,模型开始流最终文字 "Tokyo 现在 18 度" → 用户点停止

**UI 显示**:完整 tool 气泡(绿勾 + 结果 JSON)+ 半截 assistant 文字(aborted)

**服务端 `state.chatHistory`**:

```js
[
  ...,
  { role: "user", content: "Tokyo 天气怎么样?" },
  { type: "function_call", id: "fc_1", call_id: "call_abc",
    name: "get_weather", arguments: '{"city":"Tokyo"}' },
  { type: "function_call_output", call_id: "call_abc",
    output: '{"temp":18,"condition":"sunny"}' },
  // ↑ function_call 配对完整(事实 3 的福利)
  //   但缺 assistant 的最终总结文本
]
```

这是三种里最"诡异"的:tool 结果已经落库,但模型的总结丢了。下一次提问,模型会看到
"用户问了天气 → 你调了工具拿到结果 → ??? → 新问题",它可能会在下一轮开头自己补一句
"前面 Tokyo 是 18 度,"之类,也可能完全不提 —— **行为不稳定**。

---

## Retry 的"重复 user message"坑

前端 `retry()`(`web/src/useStreamingChat.ts:132-144`):

1. 找最后一条 user 消息的 `content`
2. 从 `messages` 里 pop 掉尾部 aborted/error 气泡
3. 再次调 `send(text, { retryOfUserText: text })`
4. `retryOfUserText` 只控制**前端不再重复插 user 气泡**(`useStreamingChat.ts:57`)

**后端完全看不见这个 flag** —— retry 请求和一条全新的请求走一模一样的
`/api/chat/stream`。于是 `server.ts:107` 会**又 push 一条相同内容的 user message**。

### 情况 A 的 retry 之后

```js
[
  ...,
  { role: "user", content: "介绍一下北京" },  // abort 那次 push 的
  { role: "user", content: "介绍一下北京" },  // retry 这次又 push 一条
  // 然后开始跑 agent loop,模型看到连续两条一模一样的 user
]
```

### 情况 C 的 retry 之后

```js
[
  ...,
  { role: "user", content: "Tokyo 天气怎么样?" },
  { type: "function_call", ..., call_id: "call_abc" },
  { type: "function_call_output", call_id: "call_abc", output: "..." },
  { role: "user", content: "Tokyo 天气怎么样?" },  // 新 push 的重复 user
  // 模型看到:"你问过天气 → 已经调过 get_weather → 又问了一次同样的天气"
]
```

### 后果

- 每轮都多传上一次的半成品,token 消耗虚增
- 连续多次 abort+retry 会堆积(上限是 context window)
- 情况 C 下,模型可能直接复用旧 tool 结果总结、也可能再调一次工具 —— 不稳定
- OpenAI **不会报错** —— 因为 function_call / function_call_output 的配对规则没破坏

---

## 延伸思考:如果真的出现孤儿 `function_call`,会怎样?

你的疑问:"情况 B 那种,参数填一半 abort,history 里只有 function_call 带 call_id,
没有对应的 function_call_output,下一次请求会报错吗?"

**在本 lab 的代码里不会发生**,原因就是上面的**事实 3**:function_call 和 output
是原子配对 push 的,参数没流完 = 整对都没 push。所以情况 B 的 history 里根本没有
function_call,也就谈不上孤儿。

**但如果你重构代码**(常见的重构想法:为了让 UI 上的 ToolBubble 状态和 history 更早
同步,把 function_call 的 push 挪到 `response.output_item.added` 时就做,
function_call_output 保留在 done 时做),你就真的会在 abort 场景下制造出孤儿
function_call。

这时下一次请求把 `state.chatHistory` 发给 OpenAI,会违反上面"官方背书 1"里的第 4 步
(function_call 必须有对应 output 送回)以及"背书 2"(output 必须 by `call_id` 引用
function_call)的两条契约。

**但要诚实一点**:官方 Responses API 的公开文档里**没有明确列出** "input 里出现孤儿
function_call 会返回什么错误码 / 错误文案"。根据以往使用经验,会在 input 校验阶段被
拒绝(4xx 类错误,message 大致指明 call_id 没有对应 output),但**具体状态码和文案
以你当时 API 的版本为准**。

所以本课不给你"预期错误文案",而是把它放进下方"✅ 验证你的修复"的第 4 条 —— 让你
**故意制造一次孤儿、亲眼看 API 回什么**。这样以后做架构决定时,你心里是有一条自己
跑出来的证据、不是从文档里抄来的传闻。

这也是为什么事实 3 的"原子配对 push"值得单独拎出来讲 —— 见下一节的 Best Practice。

---

## 🛡️ Best Practice:为什么把 function_call 和 output "原子配对 push"

先声明一点:**OpenAI 官方文档没有明文写"必须在 `output_item.done` 时把这两条一起
push 进 history"**。官方文档给的是**契约**(事实 1 + 2 + 3 引文),没有规定**在哪个
事件时机把什么 item 写到你本地存的 history 里**。

但在 server.ts:226-243 这种写法:

```ts
case "response.output_item.done": {
  if (ev.item.type === "function_call") {
    const parsed = safeParseJSON(ev.item.arguments ?? "{}");
    const result = await runTool(ev.item.name, parsed);

    // 两条一起 push,中间不会被打断
    state.chatHistory.push(ev.item as ResponseInputItem);
    state.chatHistory.push({
      type: "function_call_output",
      call_id: ev.item.call_id,
      output: JSON.stringify(result),
    } as ResponseInputItem);

    write("tool_result", { id: ev.item.id, result });
  }
  break;
}
```

是一个**防御性实现选择**,它用两个性质天然满足官方契约:

### 性质 A · 要么都写、要么都不写

abort / runTool 抛异常 / 网络断 / 进程崩 —— 只要有一条写失败,另一条也绝对不会落库。
history 里不会出现"违反配对契约的中间态"。你靠代码结构保证不变量,不靠"记得处理
各种异常分支"。

### 性质 B · 在"参数完整"之后才提交

只有到 `output_item.done` 时 `ev.item.arguments` 才是完整 JSON 字符串,
`safeParseJSON` 能拿到完整 object。提前在 `output_item.added` 或 args.delta 时 push,
参数要么是空、要么是 `{"ci` 这种半截串,进 history 就是污染。

---

### ⚠️ 反例:把 function_call push 挪到 `output_item.added`

常见重构动机:"我想让服务端 history 更早反映出'在调工具'这件事,比如用来做
实时监控/可观测性"。

```ts
// 不要这么做 ✗
case "response.output_item.added": {
  if (ev.item.type === "function_call") {
    state.chatHistory.push(ev.item);   // ← 此时 arguments 是空字符串
    write("tool_start", ...);
  }
  break;
}
case "response.output_item.done": {
  if (ev.item.type === "function_call") {
    const result = await runTool(...);
    state.chatHistory.push({ type: "function_call_output", ... });  // ← 只 push output
  }
  break;
}
```

问题:**abort 发生在 added 和 done 之间**(这个窗口是几百 ms 甚至几秒 —— args 流式
填充和 runTool 执行都在里面),history 里就留下了**没有 output 的孤儿 function_call**。
下一次请求就会违反官方配对契约。

"早 push 让 UI 更实时"这个需求,**应该在前端解决**:前端已经独立维护 ToolBubble
状态机(`useStreamingChat.ts` 的 `tool_start` / `tool_args_delta` / `tool_result`
事件),完全不依赖服务端 history 反映进度。

### 📌 一句话总结

**`state.chatHistory` 是"下一次发给模型的契约",不是"UI 状态的镜像"。两者不应该
同一时机更新。**

---

### 彩蛋:`output_item.done` vs `function_call_arguments.done`

官方 [Function calling — Streaming](https://developers.openai.com/api/docs/guides/function-calling#streaming)
章节的例子里,用来判定"工具参数已完整"的事件是 `response.function_call_arguments.done`
(更精确,只针对 function_call 的 arguments);本 lab 用的是 `response.output_item.done`
(更通用,任何 output item 完结都会发)。

两者都能用 —— `arguments.done` 先发,紧接着是 `output_item.done`。选前者更贴近官方
例子,选后者 switch 语句更简洁(message 和 function_call 走同一出口)。本 lab 选后者
是为了让学生在同一个 case 里看全 agent loop 的关键决策点。这是一个**实现选择**,
不是谁对谁错。

---

## 🧑‍💻 作业

从下面三个修复方向里挑**一个**实现,并用注释写清楚你为什么选它、放弃了哪些 trade-off。

### 方向 1 · 服务端 abort 时回滚(改动最小)

在 `server.ts` 的 abort 分支里把刚 push 的 user message(以及可能的孤儿 tool pair)
pop 掉:

```ts
// server.ts 大约 L131 附近
} catch (err) {
  if (isAbortError(err)) {
    // TODO: 回滚这一轮的半成品
    //   - 一定要 pop 的:本轮最开始 push 的那条 user message
    //   - 要不要 pop 的:本轮已经完成的 function_call + output pair?
    //       pop:retry 时重新调工具(干净,多一次 tool 成本)
    //       留:retry 时模型看到旧 tool 结果(省,但上下文可能不一致)
    return;
  }
  ...
}
```

需要你在本轮开始前记录一个 "**anchor 索引**"(`state.chatHistory.length`),
abort 时把数组 `splice` 回这个位置就行。

- ✅ 不改协议、不动前端
- ✅ retry 就变成和普通第一次请求完全等价
- ⚠️ 要想清楚情况 C 里那对 tool pair 是否一起回滚

### 方向 2 · 前端 retry 带 `retry=true` 标记,服务端识别后不 push user

```ts
// 前端 useStreamingChat.ts 的 send 里
fetch("/api/chat/stream", {
  body: JSON.stringify({ message: text, retry: !!opts.retryOfUserText }),
  ...
});

// 后端 server.ts
if (!req.body.retry) {
  state.chatHistory.push({ role: "user", content: message });
}
// retry 时 history 里的最后一条 user 就是"上次 abort 那条",直接复用
```

- ✅ 语义清晰("这是上一条的 retry")
- ⚠️ 只解决"重复 user"这一半;情况 C 里孤儿 tool pair 的问题没动
- ⚠️ retry=true 时如果 history 最后一条不是 user(比如孤儿 tool pair 后),逻辑要小心处理

### 方向 3 · 引入 "pending turn" 事务(侵入最高)

请求到来时不直接改 `state.chatHistory`,而是写到一个临时 `pendingTurn` 数组。
整轮(包括所有 tool 循环 + 最终 assistant 文本)全部成功才 `commit` 进真正的 history;
任何 abort / error 把 pending 整个丢弃。

```ts
type SessionState = {
  chatHistory: ResponseInputItem[];
  pendingTurn: ResponseInputItem[] | null;  // 新增
  ...
}
// 跑 agent loop 时,input 是 [...chatHistory, ...pendingTurn] 的合并
// 成功 → chatHistory.push(...pendingTurn); pendingTurn = null
// 失败/abort → pendingTurn = null
```

- ✅ abort / retry 完全干净,UI 和 history 保证一致
- ✅ 有了 pending 概念,未来做"undo last turn"也容易
- ⚠️ 每轮 `responses.create` 的 `input` 拼接要改
- ⚠️ 复杂度最高,适合已经做完方向 1 / 2、想挑战进阶的同学

---

## ✅ 验证你的修复

每做完一个方向,跑下面这 4 条自测:

1. **重复 user 测试**
   发 "介绍一下北京",流到一半点停止 → retry
   在服务端加 `console.log(state.chatHistory.map(m => m.role ?? m.type))`,
   看有没有 `['user', 'user', 'assistant']` 这种重复头。

2. **curl abort 测试**
   ```bash
   curl -sN -c jar.txt -X POST http://localhost:3000/api/chat/stream \
     -H 'Content-Type: application/json' \
     -d '{"message":"写一首长诗"}' | head -n 3
   # head 读够 3 行就断开 → 触发 res.on("close")
   curl -sN -b jar.txt -X POST http://localhost:3000/api/chat/stream \
     -H 'Content-Type: application/json' \
     -d '{"message":"你好"}'
   # 观察返回里模型有没有自己提到"长诗"—— 如果提到,说明污染没清
   ```

3. **Tool abort 测试(情况 C)**
   问 "Tokyo 天气怎么样?",**在 tool 气泡变绿之后、最终文字出来前** 点停止。
   然后问一个完全无关的问题(比如 "1+1 等于几?")。
   观察模型的回答里有没有莫名其妙提到 Tokyo / 天气。

4. **孤儿 function_call 防御测试(挑战)**
   故意把 `server.ts:233` 的第一条 push(function_call)搬到
   `response.output_item.added` 分支,**跑一次 abort** 制造孤儿 function_call,然后
   发下一条普通请求,看 API 具体返回什么(状态码 + message 都抄下来)。改回原状后
   在代码里加一条注释记录你看到的实际错误 —— 以后重构时就有据可依,不靠"听说是 400"。

---

## 扩展阅读

- Lesson 13 `13-express-stateful/server.ts` —— session + cookie 的最小实现
- Lesson 15 `15-previous-response-id/` —— 服务端不存 history,让 OpenAI 帮你存,
  这个方案天然没有本课的污染问题(但会碰到另一类问题,见 Lesson 15 README)
- Lesson 16 `16-conversations-api/` —— Conversations API 的持久化,又是另一个权衡
