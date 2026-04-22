# Lesson 15 · previous_response_id — 服务端对话链

> 一句话总结：**把对话历史丢给 OpenAI 服务端保管，你只需要传一个 ID。**

Lesson 03 教过"手动维护 `input` 数组"来实现多轮对话。
本课用 Responses API 的 `previous_response_id` 参数，让 OpenAI 服务端帮你拼接完整上下文——代码量降了一半，但 token 费用一分不少。

---

## 🎯 本课学完后你会

- 理解 **`previous_response_id`** 的工作原理：服务端存储 + 链式引用
- 知道 **`store: true`** 是必须的前提条件
- 会用两行核心代码实现多轮对话（对比 Lesson 03 手动管理数组）
- 清楚**计费规则**：历史 token 不是免费的，每一轮都全量重新计费
- 了解 **30 天 TTL** 限制以及什么场景该用、什么场景不该用
- 能读懂 `demo.ts`（脚本演示 token 增长）和 `chain.ts`（交互式 CLI 聊天）

---

## 📦 目录结构

```
15-previous-response-id/
├── demo.ts       # 3 轮脚本演示：token 增长 + 无 previous_response_id 对比
├── chain.ts      # 交互式 CLI 多轮对话
└── README.md     # ← 你正在读这个
```

---

## 🚀 运行

```bash
# 脚本演示（3 轮自动对话 + 对比）
pnpm l15:demo

# 交互式聊天（输入 /exit 退出，/tokens 查看用量）
pnpm l15
```

> 前提：项目根目录有 `.env` 文件，里面设好了 `OPENAI_API_KEY`。

---

## 📖 什么是 `previous_response_id`？

Responses API 的每一次 `client.responses.create()` 调用，都会返回一个 response 对象。这个对象有一个 `id`（格式类似 `resp_abc123`）。

当你在下一次请求中传入 `previous_response_id: "resp_abc123"` 时，OpenAI 服务端会：

1. 找到 `resp_abc123` 对应的那次请求和响应
2. 把它的完整 input + output 拼到新请求的前面
3. 如果 `resp_abc123` 自己也有 `previous_response_id`，递归往前追溯
4. 最终构建出完整的对话历史，送入模型

**你不需要自己维护任何历史数组**——服务端全帮你做了。

### 链式图示

```
请求 1:
  input: "你好，我叫 David"
  → response.id = "resp_001"       ← 服务端存下了

请求 2:
  input: "我叫什么名字？"
  previous_response_id: "resp_001"
  → 服务端实际发给模型：[user: "你好，我叫 David", assistant: "...", user: "我叫什么名字？"]
  → response.id = "resp_002"

请求 3:
  input: "帮我用一句话介绍我自己"
  previous_response_id: "resp_002"
  → 服务端实际发给模型：[完整的 3 轮对话]
  → response.id = "resp_003"
```

每一个 response 都指向上一个，形成一条**单链表**。

---

## 🔧 核心代码详解

### 第一次调用：建立链的起点

```ts
const r1 = await client.responses.create({
  model: "gpt-5.4-nano",
  instructions: "你是一个友好的中文助手，回答简短。",
  input: "你好，我叫 David，我在悉尼做前端工程师。",
  store: true,  // ★ 必须为 true，否则服务端不保存响应
});

// r1.id 就是这个响应的唯一标识
console.log(r1.id);  // "resp_xxxx..."
```

两个关键参数：

- **`input`**：第一次可以直接传字符串，也可以传 `[{ role: "user", content: "..." }]` 数组
- **`store: true`**：告诉 OpenAI "把这次请求和响应存到服务端"。**不加这个参数，后面的 `previous_response_id` 会报错**

### 后续调用：传 ID 继续对话

```ts
const r2 = await client.responses.create({
  model: "gpt-5.4-nano",
  input: [{ role: "user", content: "我叫什么名字？在哪个城市？" }],
  previous_response_id: r1.id,  // ★ 链接到上一轮
  store: true,                   // ★ 本轮也要存，否则 r2.id 不能被下一轮引用
});
```

- **`input`**：只需要放**本轮新消息**，不需要拼历史
- **`previous_response_id`**：上一轮 response 的 `id`
- **`store: true`**：如果你还要继续往后聊，本轮也必须 `store: true`

就这样，两个参数搞定多轮对话。对比 Lesson 03，你不再需要 `history: HistoryItem[]`、`history.push()`、`input: [...history, newMessage]` 这一整套手动管理。

---

## 💰 计费：不是免费的！

这是 `previous_response_id` 最容易让人误解的地方。

很多人第一反应是："服务端帮我管历史了，是不是只计本轮的 token？" **不是。**

> Even when using `previous_response_id`, all previous input tokens for responses in the chain are billed as input tokens in the API.
>
> —— OpenAI 官方文档

也就是说：

- 第 1 轮：你付 36 个 input tokens
- 第 2 轮：你付 79 个 input tokens（第 1 轮的全部内容 + 第 2 轮新消息）
- 第 3 轮：你付 114 个 input tokens（第 1+2 轮的全部内容 + 第 3 轮新消息）
- ...以此类推

**Token 费用和你自己手动拼 `input` 数组完全一样。** `previous_response_id` 省的是代码复杂度，不是钱。

### `demo.ts` 实际运行结果

```
--- 第 1 轮 ---
  [input_tokens: 36]

--- 第 2 轮 ---
  [input_tokens: 79]     ← 包含第 1 轮的全部 tokens

--- 第 3 轮 ---
  [input_tokens: 114]    ← 包含前 2 轮所有 tokens

--- 对比：不带 previous_response_id ---
  [input_tokens: 10]     ← 只有本轮 tokens
```

注意看 input_tokens 的增长趋势——这就是多轮对话的固有成本。和 Lesson 03 手动管理数组的情况完全一致。

---

## ⏳ 30 天 TTL

OpenAI 服务端存储的 response 有 **30 天的 TTL（Time To Live）**：

- `store: true` 的响应会在服务端保留 **30 天**
- 30 天后自动删除
- 如果你用 `previous_response_id` 引用一个已过期的 response，API 会返回错误（`response not found`）
- 这意味着**链条断了就接不回来**——中间任何一个 response 过期，后面的都无法追溯

对比之下，Lesson 16 要学的 Conversations API **没有 TTL 限制**，适合需要长期保留对话的场景。

---

## 🆚 对比 Lesson 03：手动 history 数组

| | Lesson 03（手动数组） | Lesson 15（`previous_response_id`） |
|---|---|---|
| 对话历史存在哪 | 你的代码里（内存/数据库） | OpenAI 服务端 |
| 每次请求传什么 | `input: [...history, newMessage]` 完整数组 | `previous_response_id` + 新消息 |
| token 计费 | 全量历史计费 | **同样全量历史计费** |
| 能否修改历史 | 可以随意增删改 | **不能**——链条是只读的 |
| 能否查看历史 | 直接读数组 | 需要 `client.responses.retrieve(id)` |
| 历史保留时间 | 取决于你的存储方案 | **30 天**，之后自动清除 |
| 代码复杂度 | 中等（需要维护数组、处理长度截断） | **极低**（只追踪一个 `id`） |
| 适合场景 | 需要精细控制对话内容的生产应用 | 快速原型、demo、简单聊天 |

**底线**：两者的模型计算和计费完全一样。区别只在"谁管理这个数组"。

---

## 🤔 什么时候用 `previous_response_id`？

### 适合用的场景

- **快速原型 / Demo**：几行代码搞定多轮对话，不用管历史管理
- **简单聊天机器人**：对话不需要超过 30 天，不需要修改历史记录
- **教学演示**：让学生专注于理解对话链的概念，不被数组管理分心
- **CLI 工具**：运行完就关的临时对话，不需要持久化

### 不适合用的场景

- **需要保留超过 30 天的对话**——TTL 会让链条断裂，考虑 Conversations API 或自己持久化
- **需要检查/修改/删除对话中的某条消息**——链条是只读的，中间不能插入或删除，用手动数组（Lesson 03）
- **需要自定义上下文管理**——比如 summarize 旧消息、截断超长对话、注入 RAG 检索结果，这些都需要你直接控制 `input` 数组
- **多分支对话**——一个 response 只能有一个 `previous_response_id`，没法实现 "从第 3 轮重新分叉"（虽然你可以从任意 response ID 开出新链）

---

## 📝 代码逐行讲解

### `demo.ts`——脚本演示

`demo.ts` 是一个**非交互式**脚本，自动跑 3 轮对话，然后跑一轮独立请求作为对比。它的目的是直观展示 `previous_response_id` 的两个核心特性：**记忆**和 **token 累积**。

```ts
// ── 第 1 轮：建立上下文 ──
const r1 = await client.responses.create({
  model: MODEL,
  instructions: "你是一个友好的中文助手，回答简短。",
  input: "你好，我叫 David，我在悉尼做前端工程师。",
  store: true,
});
```

第 1 轮告诉 AI 自己的名字和城市。`store: true` 确保 OpenAI 服务端保存这次交互。`instructions` 相当于 system prompt。

```ts
// ── 第 2 轮：用 previous_response_id 继续 ──
const r2 = await client.responses.create({
  model: MODEL,
  input: [{ role: "user", content: "我叫什么名字？在哪个城市？" }],
  previous_response_id: r1.id,
  store: true,
});
```

第 2 轮问 AI "我叫什么名字"。因为传了 `previous_response_id: r1.id`，AI 能访问第 1 轮的完整上下文，所以能正确回答 "David" 和 "悉尼"。注意 `input` 只传了本轮新消息，不用拼历史。

```ts
// ── 第 3 轮：继续追问 ──
const r3 = await client.responses.create({
  model: MODEL,
  input: [{ role: "user", content: "帮我用一句话介绍我自己。" }],
  previous_response_id: r2.id,  // 指向 r2，间接包含 r1
  store: true,
});
```

第 3 轮的 `previous_response_id` 指向 `r2.id`。由于 r2 又指向 r1，所以 AI 能看到全部 3 轮对话，可以用 "David、悉尼、前端工程师" 来组织一句话介绍。

```ts
// ── 对比：没有 previous_response_id 的独立请求 ──
const r4 = await client.responses.create({
  model: MODEL,
  input: [{ role: "user", content: "我叫什么名字？" }],
  store: true,
  // 注意：没有 previous_response_id
});
```

最后一轮不传 `previous_response_id`，是一个完全独立的请求。AI 没有任何上下文，只能回答"我不知道你叫什么"。input_tokens 只有 10——这就是没有历史负担的样子。

通过打印每轮的 `response.usage.input_tokens`，你能清晰看到 token 逐轮增长（36 → 79 → 114），而独立请求只有 10。

---

### `chain.ts`——交互式 CLI 聊天

`chain.ts` 是一个可以真正交互的 CLI 聊天程序。核心逻辑极其简单：

```ts
// 核心：只需要一个变量来追踪上一次响应的 ID
let previousResponseId: string | null = null;
```

整个"记忆系统"就是**一个变量**。对比 Lesson 03 的 `const history: HistoryItem[] = []`，这里不需要数组、不需要 push、不需要拼接。

**主循环**：

```ts
while (true) {
  const userInput = await rl.question("You: ");

  // ... /exit 和 /tokens 命令处理 ...

  const response = await client.responses.create({
    model: MODEL,
    input: [{ role: "user", content: userInput }],
    store: true,
    ...(previousResponseId && { previous_response_id: previousResponseId }),
  });

  console.log(`AI: ${response.output_text}`);

  // 更新 ID，下一轮请求会用到
  previousResponseId = response.id;
}
```

每轮对话只做 3 件事：

1. 读取用户输入
2. 调用 `responses.create()`，传入 `previous_response_id`（如果有的话）
3. 把新的 `response.id` 存到 `previousResponseId`

注意第一轮时 `previousResponseId` 是 `null`，所以用了 spread 语法 `...(previousResponseId && { previous_response_id: previousResponseId })` 来条件性地传入这个参数。第一轮不传，后续轮才传。

**`/tokens` 命令**：

```ts
if (userInput.trim() === "/tokens") {
  const prev = await client.responses.retrieve(previousResponseId);
  console.log("  上一轮 usage:", JSON.stringify(prev.usage, null, 2));
  continue;
}
```

这里用到了 `client.responses.retrieve(id)` 来获取已保存的 response 对象——因为 `store: true`，服务端保留了完整的 response（包括 usage 信息），你可以随时通过 ID 查回来。

---

## 🧊 `store: true` 的含义

`store` 参数控制 OpenAI 是否在服务端保存这次 response：

| `store` 值 | 行为 |
|---|---|
| `true` | 响应保存到 OpenAI 服务端，保留 30 天。`response.id` 可被后续请求的 `previous_response_id` 引用 |
| `false`（默认） | 响应不保存。`response.id` 仍然返回，但无法被 `previous_response_id` 使用——因为服务端找不到它 |

**重要**：如果你忘了 `store: true`，链条上的某一轮就变成了"黑洞"——它的 response 不被保存，后续的 `previous_response_id` 指向它时会报 `response not found` 错误。

链条上**每一轮都要 `store: true`**，不是只有第一轮。

---

## 🔁 完整流程图

```
┌──────────────────────────────────────────────────────────┐
│                       你的代码                           │
│                                                          │
│  let prevId = null;                                      │
│                                                          │
│  ┌─ 轮 1 ──────────────────────────────────────────┐     │
│  │ responses.create({                               │     │
│  │   input: "你好，我叫 David",                      │     │
│  │   store: true                                    │     │
│  │ })                                               │     │
│  │ → prevId = response.id  ("resp_001")             │     │
│  └──────────────────────────────────────────────────┘     │
│           │                                              │
│           ▼                                              │
│  ┌─ 轮 2 ──────────────────────────────────────────┐     │
│  │ responses.create({                               │     │
│  │   input: [{ role:"user", content:"我叫什么？" }], │     │
│  │   previous_response_id: "resp_001",              │     │
│  │   store: true                                    │     │
│  │ })                                               │     │
│  │ → prevId = response.id  ("resp_002")             │     │
│  └──────────────────────────────────────────────────┘     │
│           │                                              │
│           ▼                                              │
│  ┌─ 轮 N ──────────────────────────────────────────┐     │
│  │ responses.create({                               │     │
│  │   input: [新消息],                                │     │
│  │   previous_response_id: prevId,                  │     │
│  │   store: true                                    │     │
│  │ })                                               │     │
│  │ → prevId = response.id                           │     │
│  └──────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────┘

                    ↕ 网络请求

┌──────────────────────────────────────────────────────────┐
│                   OpenAI 服务端                           │
│                                                          │
│  收到 previous_response_id: "resp_002"                   │
│  → 查找 resp_002 的完整内容                               │
│  → resp_002 有 previous_response_id: "resp_001"          │
│  → 查找 resp_001 的完整内容                               │
│  → 拼接：[轮1 input, 轮1 output, 轮2 input, 轮2 output, │
│           轮N input]                                     │
│  → 送入模型生成回复                                       │
│  → 保存 resp_003，返回给你                                │
└──────────────────────────────────────────────────────────┘
```

---

## 🔑 常见坑

| 症状 | 原因 | 解 |
|---|---|---|
| AI 不记得之前说了什么 | 忘了加 `store: true`，响应没被保存到服务端 | 每一轮请求都必须加 `store: true` |
| API 报错 `response not found` | response 已过期（超过 30 天 TTL）或当时 `store: false` | 检查 `store` 设置；如需长期保存，用 Conversations API 或自行持久化 |
| Token 费用逐轮递增 | 这是**正常行为**——所有历史 input tokens 每轮都会重新计费 | 接受现实，或用 summarize 策略压缩历史（需要切换到手动数组方案） |
| 想修改/删除对话中的某条消息 | `previous_response_id` 链条是只读的，无法修改 | 改用手动 `input` 数组（Lesson 03）或 Conversations API（Lesson 16） |
| 第一轮传了 `previous_response_id` 导致报错 | 引用了一个不存在的 ID | 第一轮不传 `previous_response_id`；用条件 spread：`...(prevId && { previous_response_id: prevId })` |

---

## 🧠 本课核心概念一图总结

```
                   手动管理 (Lesson 03)
                  ┌──────────────────────┐
                  │  你维护 history[]     │
                  │  每轮 push + 全量传   │
                  │  可以修改/删除/截断    │
                  │  无过期限制            │
                  └──────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │      token 计费完全相同            │
         │    （全量历史每轮重新计费）         │
         └─────────────────┼─────────────────┘
                           │
                  ┌──────────────────────┐
                  │ previous_response_id │
                  │ (Lesson 15 · 本课)    │
                  │  OpenAI 管 history    │
                  │  你只传一个 ID        │
                  │  链条只读，30 天 TTL  │
                  └──────────────────────┘
                           │
                           ▼
                  ┌──────────────────────┐
                  │  Conversations API   │
                  │  (Lesson 16 · 下课)   │
                  │  无 TTL              │
                  │  更多功能...          │
                  └──────────────────────┘
```

---

## ✅ 一句话带走

> **`previous_response_id` 让 OpenAI 帮你管对话历史，代码极简——但 token 全量计费，链条只读，30 天过期。快速原型首选，生产环境三思。**
