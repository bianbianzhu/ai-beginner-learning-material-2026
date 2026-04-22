# Lesson 18 · Compaction — 上下文压缩（智能保留）

> 一句话总结：**让 OpenAI 用模型自己做"压缩"，把一段长历史塞进一个加密的 `compaction` item，既省 token，又保留语义状态——这不是摘要，这是一种内置的、模型原生的上下文管理能力。**

上一课（Lesson 17）讲了 `truncation: "auto"`——超限就丢旧消息，**硬截断**，丢了就是丢了。
本课介绍 Responses API 的 **Compaction（压缩）**：模型把长历史"揉"成一个加密状态块，既不像摘要那样丢失细节，也不像截断那样一刀切。这是 2026 年 OpenAI 为长对话和 agent 循环做的原生方案。

---

## 🎯 本课学完后你会

- 分清楚 **truncation（Lesson 17）** 和 **compaction（本课）**：一个是硬截断、一个是智能压缩
- 会用 **手动模式**：`client.responses.compact({ model, input })` 显式压缩
- 会用 **自动模式**：`context_management: [{ type: "compaction", compact_threshold: N }]` 让服务端在阈值触发
- 知道 `compaction` item 的 `encrypted_content` 为什么是乱码、以及为什么不要去"解读"它
- 理解官方的硬规则：**不要修剪 `/responses/compact` 的输出**
- 清楚 compaction 的计费模型：**现在多花一点 token 换未来所有轮次都更便宜**
- 能读懂 `manual-compact.ts` 和 `auto-compact.ts` 的每一行代码
- 知道什么时候**该用 compaction**，什么时候**不该用**

---

## 📦 目录结构

```
18-compaction/
├── manual-compact.ts   # 手动模式：显式调用 /responses/compact 端点
├── auto-compact.ts     # 自动模式：context_management + compact_threshold
└── README.md           # ← 你正在读这个
```

---

## 🚀 运行

```bash
# 手动压缩演示（对比压缩 vs 不压缩的 input_tokens）
pnpm l18:manual

# 自动压缩演示（阈值触发）
pnpm l18:auto
```

> 前提：项目根目录的 `.env` 里配好 `OPENAI_API_KEY`。

---

## 📖 什么是 Compaction？

官方定义（出自 [Compaction Guide](https://developers.openai.com/api/docs/guides/compaction)）：

> To support long-running interactions, you can use **compaction** to reduce context size while preserving state needed for subsequent turns.

翻译一下就是：

- **目标**：在"长对话"场景下，把上下文**变小**，同时**保留下一轮需要的状态**
- **不是摘要**：它不会生成人类可读的"以上对话的要点是……"那种文字
- **不是截断**：它不是简单地把旧消息删掉
- **机制**：模型把一段历史"压"成一个 **opaque、encrypted、模型专用可读** 的 item，这个 item 会出现在 `response.output` 里，`type === "compaction"`

官方原话（**一字不改**）：

> The returned compaction item carries forward key prior state and reasoning into the next run using fewer tokens. **It is opaque and not intended to be human-interpretable.**

也就是说：

- 你**不应该**尝试解码 `encrypted_content`
- 你**不应该**把它展示给用户
- 你**应该**做的事情只有一件：**原样传给下一次 `responses.create`**

### 跟 Lesson 17 的 `truncation` 有什么区别？

| 维度 | `truncation: "auto"`（Lesson 17） | Compaction（本课） |
|---|---|---|
| 触发方式 | 超过模型上下文窗口时自动触发 | 阈值触发（自动）或显式调用（手动） |
| 处理方式 | **丢弃**最早的 input items（硬截断） | **压缩**历史到一个 opaque item（保留语义） |
| 丢失信息 | 是，丢了就是丢了 | 关键状态被保留在加密 item 里 |
| 推理链 | 旧的 reasoning 完全消失 | 模型训练过如何"恢复"关键 reasoning |
| 成本 | 便宜（就是扔东西） | 需要一次额外的模型调用来生成 compaction item |
| 适合场景 | 无所谓历史丢失的闲聊 / 兜底 | 长 agent loop / 编码任务 / 多轮推理 |

简单记：**truncation 是橡皮擦，compaction 是压缩文件。**

### 为什么 2026 年它是"新东西"？

因为它是**模型内置能力**，不是你自己写的 prompt 或者框架层摘要。引用 OpenAI Cookbook 关于 GPT-5 系列的说法：

> A weaker version of this was previously possible with ad-hoc scaffolding and conversation summarization, but our **first-class implementation**, available via the Responses API, is **integrated with the model and is highly performant**.

目前被显式**训练过 compaction 能力**的模型包括：

- **GPT-5.2 / 5.3 / 5.4 系列**（含 nano / mini）
- **Codex** 系列（编码专用，agent 循环极长）

这些模型在训练阶段就见过"读取 compaction item → 继续推理"这种任务，因此比你自己去 summarize 效果好得多。

---

## 🎛️ 两种使用模式

Responses API 提供了**两个入口**使用 compaction：

### 模式 A · 手动（Manual）：独立的 `/responses/compact` 端点

```ts
const compacted = await client.responses.compact({
  model: "gpt-5.4-nano",
  input: history, // 你之前积攒的完整历史
});

// compacted.output 就是"新的 context window"
// 里面可能包含：保留下来的原始 items + 一个 compaction item
```

- **完全无状态**、**ZDR 友好**（Zero Data Retention：服务端不存储）
- 由**你**决定什么时候压缩
- 适合：你已经有逻辑判断"现在该压了"，比如"任务完成一个阶段"、"token 数超 X 了"

### 模式 B · 自动（Auto）：`context_management` 参数

```ts
const response = await client.responses.create({
  model: "gpt-5.4-nano",
  input: history,
  store: false, // ZDR 友好
  context_management: [
    { type: "compaction", compact_threshold: 200_000 } // 默认就是 200000
  ],
});
```

- 当 **rendered token count** 超过 `compact_threshold` 时，服务端**在同一个流里**自动触发一次压缩 pass
- 压缩结果作为一个额外的 item 出现在 `response.output` 里（除了你要的 `message`）
- 你**不需要**调 `/responses/compact` 端点
- 适合：agent loop 里不想自己管理触发时机的场景

官方示例（原样）：

```python
while keep_going:
    response = client.responses.create(
        model="gpt-5.3-codex",
        input=conversation,
        store=False,
        context_management=[{"type": "compaction", "compact_threshold": 200000}],
    )
    conversation.extend(response.output)
    conversation.append({
        "type": "message",
        "role": "user",
        "content": get_next_user_input(),
    })
```

**模式 A vs 模式 B** 详细对比看后面的表格。

---

## 🔑 四条官方硬规则（背下来）

这四条是**官方文档里反复强调的**，违反任何一条都可能把事情搞坏。

### 规则 1 · 不要修剪 `/responses/compact` 的输出

> **Do not prune `/responses/compact` output.** The returned window is the canonical next context window, so pass it into your next `/responses` call as-is.

不要"只取 compaction item 扔掉其他的"。`compacted.output` 整个数组就是"下一轮的完整 context window"，可能里面还有保留的原始 items（比如最近几轮对话原文）。**原样传**。

### 规则 2 · 压缩后的 window 里不止有 compaction item

> Note: the compacted window generally contains **more than just the compaction item**. It can also include retained items from the previous window.

模型会决定哪些最近的 items 值得保留原文，哪些可以压缩——这是模型的决策，你别替它做。

### 规则 3 · 如果用 `previous_response_id`，**不要手动修剪**

> If you use `previous_response_id` chaining, **do not manually prune**.

因为服务端已经在帮你管链条了，你再去修剪会搞乱引用关系。

### 规则 4 · 延迟优化：可以丢掉最新 compaction item **之前**的 items

> **Latency tip**: After appending output items to the previous input items, you can **drop items that came before the most recent compaction item** to keep requests smaller and reduce long-tail latency. The latest compaction item carries the necessary context to continue the conversation.

这是一个**优化**而不是必须的步骤。最新的 compaction item 已经包含了"必要的上下文"，所以它之前的原始 items 理论上可以丢（但请在用 stateless 数组模式时做；用 `previous_response_id` 模式时见规则 3）。

---

## 🧩 核心字段速查

### `CompactedResponse`（`/responses/compact` 的返回）

```ts
{
  id: string,                         // 这次 compact 调用的 id
  object: "response.compaction",      // 注意：不是 "response"
  output: ResponseOutputItem[],       // 新的 context window（整个数组都要原样传）
  usage: ResponseUsage,               // 本次 compact 调用花了多少 token
}
```

### `ResponseCompactionItem`（`output` 数组里那个 type === "compaction" 的元素）

```ts
{
  id: string,                         // 形如 "cmp_..."
  type: "compaction",
  encrypted_content: string,          // 加密的、base64-ish、**人类不可读**
  created_by?: string,                // 可选，表示触发方式
}
```

**关键点**：`encrypted_content` 你打印出来会看到一长串 base64-like 的字符。**这是正常的**——它被设计成"只有模型能理解"。官方原话："It is opaque and not intended to be human-interpretable."

---

## 🧪 代码逐段讲解 · `manual-compact.ts`

手动模式的完整流程分 4 步：**构造历史 → 调 compact → 用压缩结果发下一次请求 → 对比不压缩的成本**。

### Step 1 · 构造一段长历史

```ts
const history: ResponseInputItem[] = [];
for (let i = 1; i <= 10; i++) {
  history.push({
    role: "user",
    content: `第 ${i} 轮：我想知道编号 ${i} 的一些事情。请给我一段 50 字左右的介绍。${"填充内容。".repeat(30)}`,
  });
  history.push({
    role: "assistant",
    content: `第 ${i} 轮回答：关于编号 ${i}，它在数学上是一个常见的正整数……${"这里是回答内容。".repeat(30)}`,
  });
}
```

10 轮对话，每轮塞 `"填充内容。".repeat(30)` 让 token 足够多。最终 `history.length === 20`，总 token 在 3000+ 量级——足够让压缩体现出效果。

### Step 2 · 调用 `client.responses.compact()`

```ts
const compacted = await client.responses.compact({
  model: MODEL,          // "gpt-5.4-nano"
  input: history,
});
console.log(`  compacted.id: ${compacted.id}`);
console.log(`  compacted.object: ${compacted.object}`);   // "response.compaction"
console.log(`  compacted.output 数量: ${compacted.output.length}`);
console.log(`  compacted.usage:`, JSON.stringify(compacted.usage, null, 2));
```

这一步就是**核心**：一个 HTTP 调用，一个返回对象。注意：

- `compacted.object` 是 `"response.compaction"` 而不是 `"response"`——提醒你这不是一次普通的 responses.create
- `compacted.usage` 里能看到本次 compact 调用的 input/output tokens——**compact 本身也是要收费的**
- `compacted.output` 是一个数组，**里面可能有多个 item**（不止 compaction item）

### Step 3 · 检查 compaction item 的加密内容

```ts
const compactionItems = compacted.output.filter((item) => item.type === "compaction");
if (compactionItems.length > 0) {
  const first = compactionItems[0] as { id: string; type: string; encrypted_content: string };
  console.log(`  compaction.id: ${first.id}`);
  console.log(`  compaction.encrypted_content (前 80 字符): ${first.encrypted_content.slice(0, 80)}...`);
  console.log(`  → 这段加密内容人看不懂，但模型能理解上下文`);
}
```

运行后你会看到类似这样的输出：

```
compaction.id: cmp_abc123...
compaction.encrypted_content (前 80 字符): eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..XYZ...（一长串 base64-like）
→ 这段加密内容人看不懂，但模型能理解上下文
```

**不要怀疑自己**——这就是正常输出。你看不懂，模型能看懂，完事了。

### Step 4 · 用压缩后的 output 作为下一轮 input

```ts
const nextInput: ResponseInputItem[] = [
  ...(compacted.output as ResponseInputItem[]), // ★★★ 原样展开，不要修剪
  { role: "user", content: "根据我们之前的讨论，请用一句话总结：我们聊了多少轮？每轮是关于什么的？" },
];

const response = await client.responses.create({
  model: MODEL,
  input: nextInput,
});
console.log(`  AI:   ${response.output_text.slice(0, 200)}...`);
console.log(`  [input_tokens: ${response.usage?.input_tokens}]`);
```

注意那一行注释——`原样传入，不要修剪`。这是**规则 1**的直接体现。你把 `compacted.output` 整个 spread 到新的 input 里，然后在后面追加本轮的用户问题。

### Step 5 · 对比：不压缩会花多少 token？

```ts
const response2 = await client.responses.create({
  model: MODEL,
  input: [
    ...history, // 20 个原始 items
    { role: "user", content: "根据我们之前的讨论，请用一句话总结：我们聊了多少轮？每轮是关于什么的？" },
  ],
});
console.log(`  [input_tokens: ${response2.usage?.input_tokens}]`);
```

### 实测结果

```
=== 结论 ===
压缩前 input tokens: 3340
压缩后 input tokens: 2029
```

**节省约 40%**。对一段 10 轮对话来说，这个比例已经很可观；历史越长，节省越明显。重点：**语义没有丢失**，AI 仍然能正确回答"我们聊了 10 轮，每轮讨论一个编号"。

---

## 🧪 代码逐段讲解 · `auto-compact.ts`

自动模式的好处是**你不用自己判断什么时候触发**。服务端在流里看到 token 跨过阈值，就自动压一次。

### Step 1 · 构造 15 轮对话历史 + 本轮新问题

```ts
const history: ResponseInputItem[] = [];
for (let i = 1; i <= 15; i++) {
  history.push({
    role: "user",
    content: `第 ${i} 轮：请告诉我一个关于编号 ${i} 的有趣事实。${"填充。".repeat(40)}`,
  });
  history.push({
    role: "assistant",
    content: `第 ${i} 轮回答：编号 ${i} 是一个有意思的整数。${"回答内容。".repeat(40)}`,
  });
}
history.push({ role: "user", content: "根据我们之前的讨论，我们聊了多少轮？" });
// history.length === 31
```

31 个 items，比 manual 里的 20 个更长，确保能突破 `compact_threshold`。

### Step 2 · 发起请求，开启 `context_management`

```ts
const response = await client.responses.create({
  model: MODEL,
  input: history,
  store: false, // ZDR 友好：服务端不存请求/响应
  context_management: [
    { type: "compaction", compact_threshold: 2000 } // 示例用 2000 方便触发
  ],
});
```

两个关键点：

- **`store: false`**：和 Lesson 15 的 `store: true` 反向。这里我们**不要**服务端存储，走 ZDR 路径。官方明确说 compaction 在 `store=false` 时 ZDR 友好
- **`compact_threshold: 2000`**：**示例专用**。官方默认 `200000`（二十万），生产环境不要抄 2000 这个数字

### Step 3 · 分析 `response.output` 的结构

```ts
console.log(`  总 output items 数量: ${response.output.length}`);
const typesByCount: Record<string, number> = {};
for (const item of response.output) {
  typesByCount[item.type] = (typesByCount[item.type] || 0) + 1;
}
console.log(`  types:`, typesByCount);
```

自动模式下，`response.output` 里会同时出现：

- 1 个 `message` item（AI 对你本轮问题的回答）
- 1 个或多个 `compaction` item（服务端自动塞进去的）

实测输出类似：

```
总 output items 数量: 3
types: { compaction: 1, message: 1, reasoning: 1 }
✓ 检测到 compaction item（服务端自动压缩已触发）
```

**对比**：如果阈值没触发，types 里就不会有 `compaction`。

### Step 4 · 延续对话：把整个 output 作为下一轮 input

```ts
const nextInput: ResponseInputItem[] = [
  ...(response.output as ResponseInputItem[]), // 整个 output 原样传
  { role: "user", content: "请一句话总结我们的讨论主题。" },
];

const r2 = await client.responses.create({
  model: MODEL,
  input: nextInput,
  store: false,
  context_management: [{ type: "compaction", compact_threshold: 2000 }],
});
```

这就是官方示例里 `conversation.extend(response.output)` 的 TypeScript 版本。每一轮都：

1. 把上一轮的 `response.output` 追加到对话数组
2. 追加新的用户消息
3. 重新调 `responses.create`，保持 `context_management` 参数

如果希望更省，可以用**规则 4** 的技巧，把"最新 compaction item 之前"的 items 丢掉。

---

## 📊 三种上下文管理方案横向对比

| 维度 | Auto Compaction（模式 B） | Manual Compaction（模式 A） | Truncation: "auto"（Lesson 17） |
|---|---|---|---|
| **触发时机** | 服务端在 token 超 `compact_threshold` 时自动 | 你显式调 `/responses/compact` | 服务端在超 context window 时自动 |
| **控制粒度** | 中（你定阈值） | 高（你定时机） | 低（临界才触发） |
| **额外成本** | 当触发时产生一次 compaction pass 的 token 费 | 每次 compact 都是一次独立的模型调用 | 零（直接丢） |
| **语义保留** | ✅ 模型原生压缩，保留关键状态 | ✅ 同上 | ❌ 丢了就是丢了 |
| **人类可读** | ❌ `encrypted_content` 不可读 | ❌ 同上 | ✅ 被丢的消息你本地还有 |
| **ZDR 友好** | ✅ 配 `store: false` | ✅ 端点本身无状态 | ✅ 无存储需求 |
| **代码复杂度** | 低（一个参数） | 中（要管理触发逻辑） | 最低（一个参数） |
| **适合场景** | 长 agent loop、编码任务、不想自己判断时机 | 有明确阶段划分的任务（比如"一个 task 完成后"） | 闲聊、无所谓历史丢失、兜底 |
| **失败模式** | 阈值太低频繁触发 → 反而更贵 | 忘记调用 → 上下文超限 | 丢的恰好是关键信息 → AI 失忆 |

**选择建议**：

- **agent 循环、编码任务** → Auto Compaction（简单省事，模型决定时机）
- **分阶段工作流** → Manual Compaction（精确控制在"阶段切换点"压缩）
- **不重要的闲聊** → Truncation: "auto"（零成本兜底）
- **三者组合用** → 以 compaction 为主，truncation 为最后一道防线

---

## 💰 计费模型：先花钱，后省钱

这是初学者最容易误解的一点。看到"压缩"两个字，很多人以为能直接变便宜。**错。**

### Compaction 本身要 token 费

无论是手动还是自动：

- **手动** `/responses/compact`：返回的 `usage` 里会显示这次压缩花了多少 input/output tokens。它本质上是一次模型调用
- **自动** `context_management`：当阈值触发时，服务端在同一次 responses.create 里做一次额外的 pass，这部分 token 也会体现在 `usage` 里

### 但是**后续轮次**会便宜

一旦 compaction item 生成，后续请求只需要传这个加密的小包裹（通常几百到一两千 token），不用再传整段历史。对 agent 循环来说：

```
不压缩：轮 1（1k）→ 轮 2（2k）→ 轮 3（3k）→ ... 轮 20（20k）
累计 input_tokens ≈ n(n+1)/2 · 平均轮 token → O(n²) 增长

压缩（第 10 轮触发一次）：
轮 1-9：正常增长（1k → 9k）
第 10 轮：9k + 一次 compact 费
轮 11-20：每轮 ≈ 1k（compaction item）+ 当轮新 token
累计显著下降
```

**底线**：**长对话越长，compaction 越划算**。短对话用了反而是亏的——你多付了一次 compact 的钱，却没省下多少传输 token。

### 实测（本课 manual-compact.ts）

```
压缩前 input tokens（第 11 轮）：3340
压缩后 input tokens（第 11 轮）：2029
节省：~40%

但是 compact 调用本身花了：约 1500 input tokens + 模型输出 token
```

所以**一轮的账**不一定划算。compaction 是一个**长期投资**——你用当下的 token 开销换之后所有轮的持续节省。

---

## 🧊 `compact_threshold` 怎么选？

- **官方默认**：`200000`（20 万 token）
- **示例用的 `2000`**：只是为了让演示立刻触发，**不要照搬到生产**
- **生产建议**：
  - 留足冗余：不要卡着模型 context window 上限（比如模型是 256k，阈值别设 240k）
  - 考虑 latency：触发 compaction 会增加**本轮**的耗时，频繁触发会拖慢流式响应
  - 不同任务不同阈值：编码 agent 可能需要 300k+，普通聊天 100k 就够

一个经验公式：**阈值 ≈ min(模型 context window × 0.7, 预估平均对话 × 2)**。

---

## 🧠 自动 vs 手动：我该选哪个？

### 选 **Auto** 如果：

- 你在写 agent loop（Lesson 12 那种 `while (true)`）
- 你不想自己判断"什么时候该压"
- 你的对话模式不规则、很难预测何时 token 会爆
- 你用的是已训练 compaction 的模型（GPT-5.2+、Codex）

### 选 **Manual** 如果：

- 你的工作流有**明确阶段**（比如"收集信息 → 分析 → 输出"）
- 你希望在阶段切换点**精准压缩**，而不是靠阈值
- 你要做 A/B 测试，想控制压缩时机这个变量
- 你在做批处理——预先压缩历史，后面多次复用

### 两个都不要选 如果：

- 对话很短（3-5 轮），整体才几百 token——不值得
- 你需要**人类可读**的历史摘要（例如给用户展示）——自己写摘要，别用 compaction
- 模型不支持 compaction（比如一些早期或非 GPT-5 系列模型）

---

## ⚠️ 常见坑（症状 → 原因 → 解）

| 症状 | 原因 | 解 |
|---|---|---|
| `compaction.encrypted_content` 打印出来是乱码 | 这是**正常现象**——它被设计成 opaque、加密的，只有模型能读 | 不要尝试解码或展示给用户。原样传下一次请求即可 |
| 调了 compact 后 input_tokens **没少**甚至变多 | 输入本身太小（低于阈值）、对话太短（就几轮）、或 compact 本身的输出 usage 被算进去了 | 压缩适合长对话。几轮的场景不要用 compaction |
| 想查看 compaction 里到底压了什么 | **无法查看**。官方明确说 "It is opaque and not intended to be human-interpretable." | 如果你需要人类可读的摘要，不要用 compaction，自己调一次 model 让它做 summarize |
| `compact_threshold` 设多少才合适 | 默认是 `200000`。示例用 `2000` 只是演示 | 生产建议留足冗余，一般取模型 context window 的 60-70% |
| `/responses/compact` 返回的 output 能不能裁剪？ | **绝对不要**。官方 quote："Do not prune /responses/compact output. The returned window is the canonical next context window, so pass it into your next /responses call as-is." | 整个 `compacted.output` 数组 spread 到下一次 input，不删、不改、不排序 |
| 用了 `previous_response_id` 还想手动修剪历史 | 官方明确禁止："If you use previous_response_id chaining, do not manually prune." | 要么用 `previous_response_id` 完全交给服务端，要么用 stateless 数组模式自己管——**别混用** |
| Auto 模式下 `response.output` 里没看到 compaction item | 没超过 `compact_threshold`，服务端没触发 | 检查 token 总量 vs 阈值；或者你的对话本身就短，这是正常的 |
| 把 compaction item 当成普通 message，前端展示 | 会显示一段 base64 乱码给用户 | 前端渲染时按 `type === "message"` 过滤；`type === "compaction"` 的只在发 API 时往 input 里塞 |
| 把 `compacted.output` 传给**不支持 compaction 的模型** | 非训练过的模型不会"理解"那段加密状态 | 确保上下游两次请求用的都是 GPT-5.2+ 或 Codex 系列 |
| 一段本来就超 context window 的历史传给 `/responses/compact` | **压缩端点本身也有 context 上限** —— 官方说"The context window that you send to /compact should fit within your model's context window." | 在上下文接近满时就该先压一次，不要等到真的超限 |

---

## 🧱 一个完整的 agent 循环骨架（stateless 数组模式）

把所有课的知识拼起来，长对话的"正确姿势"：

```ts
import OpenAI from "openai";
import type { ResponseInputItem } from "openai/resources/responses/responses";

const client = new OpenAI();
const MODEL = "gpt-5.4-nano";

async function runAgentLoop() {
  const conversation: ResponseInputItem[] = [
    { role: "user", content: "Let's begin a long coding task." },
  ];

  while (true) {
    const response = await client.responses.create({
      model: MODEL,
      input: conversation,
      store: false,                                  // ZDR 友好
      context_management: [
        { type: "compaction", compact_threshold: 200_000 }
      ],
      truncation: "auto",                            // 兜底：超 context window 时硬截断
    });

    // 把整个 output 追加进对话（包含 compaction item / message / tool calls / reasoning 等）
    conversation.push(...(response.output as ResponseInputItem[]));

    // 追加下一轮用户输入
    const nextUserInput = await getNextUserInput();
    if (!nextUserInput) break;

    conversation.push({ role: "user", content: nextUserInput });

    // （可选）延迟优化：丢掉最新 compaction item 之前的 items
    // const lastCompactionIdx = findLastCompactionIndex(conversation);
    // if (lastCompactionIdx > 0) {
    //   conversation.splice(0, lastCompactionIdx);
    // }
  }
}
```

**三层防御**：

1. `context_management`（**主**）——正常情况下的智能压缩
2. `truncation: "auto"`（**兜底**）——万一压缩来不及或被跳过，硬截断保命
3. `store: false`（**合规**）——ZDR 友好，适合企业场景

---

## 📜 官方原话合集（都能在官网上搜到）

> "To support long-running interactions, you can use compaction to reduce context size while preserving state needed for subsequent turns."

> "The returned compaction item carries forward key prior state and reasoning into the next run using fewer tokens. **It is opaque and not intended to be human-interpretable.**"

> "When the rendered token count crosses the configured threshold, the server runs server-side compaction."

> "**Do not prune `/responses/compact` output.** The returned window is the canonical next context window, so pass it into your next `/responses` call as-is."

> "Note: the compacted window **generally contains more than just the compaction item**. It can also include retained items from the previous window."

> "**Latency tip**: After appending output items to the previous input items, you can drop items that came before the most recent compaction item… If you use `previous_response_id` chaining, do not manually prune."

> "A weaker version of this was previously possible with ad-hoc scaffolding and conversation summarization, but our first-class implementation, available via the Responses API, is integrated with the model and is highly performant."

---

## 🔁 可视化：一次 auto compaction 的生命周期

```
你的代码                              OpenAI 服务端
───────────                          ────────────────────────
history = [20 个 items, ~3000 tokens]
│
└─ responses.create({
     input: history,
     context_management: [
       { type: "compaction",
         compact_threshold: 2000 }
     ],
     store: false
   })
                                  ┌──▶ 接收请求
                                  │    算 rendered token: 3100
                                  │
                                  │    3100 > 2000? 是 → 触发 compaction pass
                                  │
                                  │    ┌─ 内部流程 ─────────────┐
                                  │    │ 1. 模型 "压缩" 老历史    │
                                  │    │ 2. 产生 encrypted_content│
                                  │    │ 3. 更新 context         │
                                  │    │ 4. 继续生成用户问题的回答│
                                  │    └────────────────────────┘
                                  │
                                  │    在同一个 response 流里返回：
                                  │    response.output = [
                                  │      { type: "compaction",
                                  │        encrypted_content: "..." },
                                  │      { type: "message",
                                  │        content: "AI 的回答" }
                                  │      (可能还有 reasoning item)
                                  │    ]
                                  │
◀────────────────────────────────┘

你的代码收到后：
  conversation.push(...response.output)
  // 现在 conversation 里有了压缩后的 state
  // 下一轮只需传这个小得多的数组
```

---

## 🧠 一图总结三课之间的关系

```
┌──────────────────────────────────────────────────────┐
│              长对话 token 管理的三把刀                │
├──────────────────────────────────────────────────────┤
│                                                      │
│  📏 Lesson 15 · previous_response_id                 │
│     "服务端帮你存历史，你只传 ID"                     │
│     → 代码最简，但 token 全量计费                     │
│                                                      │
│  💾 Lesson 16 · Conversations API                    │
│     "持久化容器，无 TTL"                              │
│     → 适合超过 30 天的长期对话                        │
│                                                      │
│  ✂️  Lesson 17 · truncation: "auto"                  │
│     "超限硬截断，丢了就是丢了"                        │
│     → 零成本兜底，不保语义                            │
│                                                      │
│  🧊 Lesson 18 · Compaction (本课)                    │
│     "模型原生压缩，保留关键状态"                      │
│     → 有成本，但是长对话的最佳方案                    │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## ✅ 一句话带走

> **Compaction 是 OpenAI 为长对话和 agent 循环提供的"模型原生压缩"——比摘要更省心、比截断更保真。**
> **两种用法：手动 `/responses/compact` 精确控制时机、自动 `context_management` 服务端阈值触发。**
> **一条铁律：返回的 `output` 原样传下去，不修剪、不解读、不展示给用户。**
> **一个权衡：现在多花一点 token，换未来几十轮的持续便宜——对话越长越划算。**
