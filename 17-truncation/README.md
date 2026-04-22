# Lesson 17 · Truncation — 自动截断（安全网）

> 一句话总结：**给 `responses.create()` 加一个 `truncation: "auto"` 参数，当输入超出模型上下文窗口时，OpenAI 会自动丢掉最早的 input items，避免 400 报错——代价是旧内容永远丢失。**

Lesson 15、16 教过怎么让对话越聊越长（`previous_response_id` / `conversation`）。但是**所有对话都有一个天花板**：模型的 context window。一旦 input tokens 超了，API 会直接返回 400 `context_length_exceeded`。`truncation` 参数就是为这种极端场景准备的兜底开关。

本课只讲一个参数、三行代码，但概念必须拎清：**`truncation` 是"硬截断"，不是智能压缩**。真正的语义保留方案叫 compaction，放在下一课（Lesson 18）。

---

## 🎯 本课学完后你会

- 理解 **`truncation` 参数的三种取值**（`"disabled"` / `"auto"` / `null`）以及各自的行为
- 知道 **什么时候会触发截断**（答案：只有当 input tokens 超出模型 context window 时）
- 清楚 **被丢弃的内容无法恢复**——truncation 是 **硬截断**，不做语义保留
- 会用 **一行代码**给生产应用加上"对话超长兜底"
- 能区分 **truncation vs compaction**：前者丢内容免费，后者压内容但要花 token
- 了解 **常见坑**：为什么设置了 `"auto"` 还是可能 400、为什么 AI 突然"忘事"

---

## 📦 目录结构

```
17-truncation/
├── truncation.ts   # 三个场景演示：不设 / 设 "auto" / 长历史 + "auto"
└── README.md       # ← 你正在读这个
```

只有一个 `.ts` 文件，没有前后端、没有 CLI——本课的目标是**把参数讲清楚**，不是堆代码量。

---

## 🚀 运行

```bash
pnpm l17
```

> 前提：项目根目录有 `.env`，里面设好了 `OPENAI_API_KEY`。

运行后你会看到三段输出，对应三个场景（详见下文"代码逐段讲解"）。

---

## 📖 什么是 `truncation` 参数？

OpenAI Responses API 在 `client.responses.create({...})` 的参数中，有一个可选字段：

```ts
truncation?: "auto" | "disabled" | null
```

它控制当**输入 tokens + 预计输出 tokens 超出模型 context window**时，服务端应该怎么处理：

| 值            | 行为                                                                 |
| ------------- | -------------------------------------------------------------------- |
| `"disabled"`  | **默认值**。超限时直接返回 400 错误（`context_length_exceeded`）。    |
| `"auto"`      | 超限时，服务端自动从对话的**开头**丢弃 input items，直到放得下为止。 |
| `null`        | 等价于 `"disabled"`（不传也是这个效果）。                             |

注意：**它只在"超限"时才生效**。你在一轮 50 tokens 的小对话里加不加这个参数，行为完全一致——不会有任何丢弃。

### 触发场景示意

```
             模型 context window（假设 X tokens）
             ├──────────────────────────────────────────┤
input items: [ item1 ][ item2 ][ item3 ] ... [ itemN ]

情况 A：总 tokens ≤ X        →  不论 truncation 设什么，都正常返回
情况 B：总 tokens > X
       └─ truncation: "disabled" → 400 error: context_length_exceeded
       └─ truncation: "auto"     → 服务端丢掉 item1（可能还有 item2…）
                                    直到剩余 tokens ≤ X，再送模型
```

### 一个你必须诚实面对的细节

**"到底丢哪些 item、丢多少个"完全由 OpenAI 服务端决定，不在 SDK 参数里暴露。** 根据公开资料和社区讨论，`"auto"` 的行为是**从最早的 input item 开始按顺序丢弃**，直到剩下的 tokens 能塞进窗口。但是：

- 这不是"总结压缩"，不是"摘要"——就是**整条丢掉**
- 丢掉之后**模型看不到了**，你的 `response.usage.input_tokens` 会是截断后的实际值
- 如果你关键信息放在对话开头（比如用户名、业务约束、早期 system 上下文），**被截掉就是真没了**

所以 `"auto"` 的定位是：**产线应用的"别 500 了"安全网**，不是"智能记忆管理"。需要智能记忆管理，请等 Lesson 18。

---

## 🧩 代码逐段讲解（`truncation.ts`）

打开 `truncation.ts`，从上到下有三个场景，外加一张对照表。下面逐段拆解。

### 准备工作

```ts
import "dotenv/config";
import OpenAI from "openai";
import type { ResponseInputItem } from "openai/resources/responses/responses";

const client = new OpenAI();
const MODEL = "gpt-5.4-nano";
```

- `ResponseInputItem` 是 SDK 导出的类型，代表一条 input item（通常就是 `{ role, content }`）。后面构造长历史时拿它做数组元素类型
- 模型选 `gpt-5.4-nano`，context window 足够大——**本课的演示并不会真的把它塞满**（后面会解释）

### 场景 1：不传 `truncation`，走默认行为

```ts
console.log("--- 场景 1: truncation 未设置（默认 = 'disabled'）---");
const r1 = await client.responses.create({
  model: MODEL,
  input: "用一句话解释 HTTP 状态码 404。",
  // 没有 truncation 参数，默认为 disabled
});
console.log(`AI:   ${r1.output_text}`);
console.log(`  [input_tokens: ${r1.usage?.input_tokens}]\n`);
```

这里只是一个普通的短请求，不传 `truncation`。运行时你会看到：

```
AI:   HTTP 404 表示请求的资源在服务器上不存在。
  [input_tokens: 17]
```

**要点**：`input_tokens: 17` 远远小于模型窗口，所以 `truncation` 设不设无所谓。这个场景是对照组，告诉你"默认"是什么样。

### 场景 2：显式开启 `"auto"`（但不触发）

```ts
console.log("--- 场景 2: truncation: 'auto' ---");
const r2 = await client.responses.create({
  model: MODEL,
  input: "用一句话解释 HTTP 状态码 500。",
  truncation: "auto", // 安全网：超限时自动丢弃旧消息
});
console.log(`AI:   ${r2.output_text}`);
console.log(`  [input_tokens: ${r2.usage?.input_tokens}]\n`);
```

运行结果：

```
AI:   HTTP 500 表示服务器在处理请求时发生了内部错误。
  [input_tokens: 17]
```

**要点**：
- `truncation: "auto"` 已经加进去了，**但没触发**——因为 input 只有 17 tokens，远未超限
- 输出和场景 1 几乎一样，没区别
- 这一段的意义是**演示语法**：一行参数就能加上安全网，不改动任何业务逻辑

### 场景 3：构造长历史，观察 input_tokens 增长

```ts
console.log("--- 场景 3: 长 history + truncation: 'auto' ---");
const longHistory: ResponseInputItem[] = [];

// 模拟 30 轮对话，每轮塞入一段长文本
for (let i = 1; i <= 30; i++) {
  longHistory.push({
    role: "user",
    content: `第 ${i} 轮问题：请告诉我一个关于编号 ${i} 的趣事。${"这是填充内容。".repeat(50)}`,
  });
  longHistory.push({
    role: "assistant",
    content: `第 ${i} 轮回答：编号 ${i} 是一个有趣的数字。${"这里是回答内容。".repeat(50)}`,
  });
}
longHistory.push({ role: "user", content: "回顾一下：我们第 1 轮聊了什么？" });

const r3 = await client.responses.create({
  model: MODEL,
  input: longHistory,
  truncation: "auto", // 关键：防止超限
});
console.log(`AI:   ${r3.output_text.slice(0, 200)}${r3.output_text.length > 200 ? "..." : ""}`);
console.log(`  [input_tokens: ${r3.usage?.input_tokens}] ← 总计 input tokens`);
console.log(`  [history items 数量: ${longHistory.length}]\n`);
```

这一段刻意堆了一个**较大的历史**：30 轮对话、每轮两条消息、每条消息填充 50 遍固定文本，再加一条收尾的 user 提问——总共 61 条 items。

运行结果（真实输出）：

```
AI:   我们在第 1 轮聊了关于编号 1 的趣事……（省略）
  [input_tokens: 16400] ← 总计 input tokens
  [history items 数量: 61]
```

**要点**：
- 61 条 items 加起来大约 **16400 个 input tokens**——这只是一个"中等偏大"的 prompt，**并没有超出 `gpt-5.4-nano` 的上下文窗口**
- 所以即使开了 `truncation: "auto"`，这一次调用**也不会真的触发截断**
- AI 能正确回顾"第 1 轮"说了什么——因为所有 61 条 items 都进了模型
- 这个场景演示的是**参数怎么加、接口怎么调、tokens 怎么看**，**不是**"截断在跑"

> 💡 **为什么不演示真正触发截断？** 因为要真的超出 `gpt-5.4-nano` 的 context window，需要几十万甚至上百万 tokens 级别的输入。那种请求既慢又贵，对教学没收益。本课关心的是**语法 + 语义**，不是把窗口撑爆。

### 对照表输出

代码最后用 `console.log` 打出一张对照表：

```
| 值          | 行为                                            |
|-------------|-------------------------------------------------|
| 'disabled'  | 默认。超限时返回 400 错误（context_length_exceeded）|
| 'auto'      | 超限时自动丢弃最早的 input items 以适应窗口       |
| null        | 等价于 'disabled'                                |
```

这张表就是本课的核心信息，**背下来即可**。

---

## ⚡ 什么时候截断会真的触发？

这是大多数学员的第一个疑问：既然演示都没触发，那**什么时候才触发**？

答案：**只有当本次请求的 input tokens（加上预计 output tokens）超过模型 context window 时。**

不同模型的 context window 大小不同。本课用的 `gpt-5.4-nano` 的 context window 非常大（具体数字请以 OpenAI 官方文档为准，本 README 不编造数字）。对于大多数常规对话应用来说，你**很难**真的触达这个上限。

会真正触发的典型场景：

- **超长上下文注入**：整本书、整个代码库、多份长 PDF 一次性塞进 input
- **失控的聊天历史**：跑了几周没清理的 `conversation`、累加了数千轮的对话链
- **高并发 agent 反复调用工具**：每轮 tool call 都往历史里加 tool output，积累多轮之后体积爆炸
- **RAG 检索返回的 chunks 太多**：一次检索塞进几十个段落

所以 `truncation: "auto"` 的正确定位是：**"set it and forget it"（设好就别管）的兜底开关**。你不需要精确计算 tokens，只要加上这个参数，就能避免程序被 context 爆仓打挂。

---

## 🆚 Truncation vs Compaction（Lesson 18 预告）

这是理解本课**最重要**的对比，也是最容易混淆的地方。

|                  | Truncation（本课）                     | Compaction（Lesson 18）                         |
| ---------------- | -------------------------------------- | ----------------------------------------------- |
| **做什么**       | 从开头丢弃 input items                 | 生成一份压缩/摘要代表旧对话，替换原始历史       |
| **语义保留**     | ❌ 丢了就是丢了                         | ✅ 关键信息被总结保留                           |
| **额外成本**     | 免费，不花任何 token                   | 要花一次额外的 LLM 调用（压缩那一步要 tokens）  |
| **触发方式**     | 超限时服务端自动丢                     | 由你自己（或 SDK 的自动策略）决定什么时候压缩  |
| **控制粒度**     | 零控制——"丢哪些"完全交给服务端         | 可以你自己写压缩逻辑，也可以用 SDK 的自动方案   |
| **适合场景**     | 生产兜底、避免 context 爆仓报错        | 真正需要"长记忆"的 agent/chatbot               |
| **对用户体验**   | AI 可能会"突然忘事"                    | AI 的记忆**渐进式**退化（但关键事实保留）      |

**粗略的心智模型**：
- **truncation** 像把老照片**直接扔进垃圾桶**——省事、免费、但没了就是没了
- **compaction** 像把老照片**扫描成摘要相册**——花时间花钱，但未来还能查到主要信息

两个工具解决的是**不同层面的问题**：
- 如果你完全不在乎历史被丢，只想防 400 → `truncation: "auto"` 足够
- 如果你要让 agent"记住"用户说过什么 → 必须 compaction（或手动 summarize）

**推荐组合**：`truncation: "auto"` + compaction 一起上。compaction 作为主策略负责"聪明地瘦身"，`truncation: "auto"` 作为最后兜底——万一 compaction 没跟上节奏，硬截断也不会让服务崩。

---

## 🔑 常见坑

| 症状                                              | 原因                                                                                           | 解                                                                                          |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| API 报 `400 context_length_exceeded`              | 默认 `truncation: "disabled"`，input 已超 context window                                        | 加 `truncation: "auto"` 作为兜底；或缩短 input / 清理历史                                    |
| AI 突然"忘了"之前说过的东西                        | `truncation: "auto"` 触发了，把最早的 input items 丢了                                         | 改用 compaction（Lesson 18）做语义保留；或手动管理 history，做 summarize                    |
| 加了 `truncation: "auto"` 还是 400                | 某**单个** input item 已经单独超窗（比如一份巨型文档），丢其他 item 也不够                     | 先对该 item 自身做切分/摘要；`truncation` 不会"砍"一条 item 的内部内容，它只整条丢          |
| 想控制"丢哪些 item"                               | `truncation: "auto"` 的丢弃策略完全由服务端决定，**不可配置**                                  | 切回手动 history 管理，自己写截断 / 摘要逻辑（参考 Lesson 03）                              |
| 开了 `"auto"` 之后想知道到底丢了啥                | SDK 不在响应里直接告诉你"丢了哪些" —— 你只能看到最终的 `usage.input_tokens`                    | 接受黑盒；或在客户端保留完整 history 副本，和 `usage.input_tokens` 对照估算                 |
| 把 `truncation` 当智能压缩用                      | 概念混淆——`truncation` 是硬截断，不做语义                                                      | 分清两个工具：硬截断 → truncation；语义压缩 → compaction                                    |
| 在一轮小对话里测试 `"auto"`，观察不到任何效果     | 没超限时 `"auto"` 根本不生效，行为和 `"disabled"` 一样                                         | 理解参数**只在超限时才生效**，这是正常现象                                                  |

---

## 🧠 适用场景 vs 不适用场景

### ✅ 适合用 `truncation: "auto"`

- **生产环境的聊天应用**，对话长度不可预测——加上作为安全网，防止偶发的超长输入打挂服务
- **Agent / Tool calling** 反复循环的场景，工具输出可能突然暴涨——兜底防 400
- **RAG 系统** 在极端情况下返回超多 chunks——兜底防 context 爆仓
- **和 compaction 一起用**：compaction 做主策略，`truncation: "auto"` 做最后一道防线

### ❌ 不适合只靠 `truncation: "auto"`

- **长期记忆型 chatbot**：用户期望 AI 记住几周前的对话。硬截断 = AI 突然失忆，用户体验崩盘。请用 compaction
- **业务关键信息在对话开头**：比如 user profile、业务规则、重要指令放在前面。truncation 会**优先丢这些**。请手动管理 history 或单独把关键信息塞进 `instructions`
- **需要精确预算 tokens**：比如按 tokens 计费给客户的场景。truncation 的丢弃行为由服务端控制，你很难事先算准"究竟会送多少 tokens 进模型"。请手动管理
- **需要审计对话历史**：truncation 是"送模型前丢"，不是"从你的存储里丢"。如果你要做对话审计，必须自己保留完整历史，`truncation` 只影响单次请求送给模型的内容

---

## 🧪 实际运行输出（参考）

把 `truncation.ts` 跑一遍，典型输出如下：

```
=== Lesson 17 · Truncation 演示 ===

--- 场景 1: truncation 未设置（默认 = 'disabled'）---
AI:   HTTP 404 表示请求的资源在服务器上不存在。
  [input_tokens: 17]

--- 场景 2: truncation: 'auto' ---
AI:   HTTP 500 表示服务器在处理请求时发生了内部错误。
  [input_tokens: 17]

--- 场景 3: 长 history + truncation: 'auto' ---
AI:   我们在第 1 轮聊了关于编号 1 的趣事……
  [input_tokens: 16400] ← 总计 input tokens
  [history items 数量: 61]

=== truncation 参数对照表 ===
| 值          | 行为                                            |
|-------------|-------------------------------------------------|
| 'disabled'  | 默认。超限时返回 400 错误（context_length_exceeded）|
| 'auto'      | 超限时自动丢弃最早的 input items 以适应窗口       |
| null        | 等价于 'disabled'                                |

要点：
1. 'auto' 是硬截断，不做语义压缩，丢的内容就是丢了
2. 如果需要智能压缩 → 用第 18 课的 compaction
3. 推荐：不确定对话长度的生产场景，开启 'auto' 作为兜底
```

注意场景 3 的 `input_tokens: 16400` ——这是 **61 条 items 完整送入模型**后算出来的数字，并**没有触发截断**。我们只是在**演示语法 + 观察 tokens 规模**。要实际看到 `"auto"` 剪掉内容，需要把窗口打爆，不在本课的教学范围内。

---

## 🔁 和前几课的关系

```
Lesson 03  手动 history 数组          → 你控制一切（包括要不要手动 truncate）
  │
Lesson 15  previous_response_id       → 服务端串起历史，但超长一样会 400
  │
Lesson 16  Conversations API          → 服务端持久化对话，超长一样会 400
  │
Lesson 17  truncation: "auto"（本课） → 超长时服务端自动丢 item 兜底（丢了就丢了）
  │
Lesson 18  Compaction                 → 超长时智能压缩保留语义（要花 tokens）
```

**关键洞察**：Lesson 15 和 16 解决的是"谁来**存**对话历史"，**并没有解决"历史太长怎么办"**。当 Lesson 15/16 的对话跑得足够久，同样会撞到 context window 上限——这时就需要 Lesson 17（硬截断兜底）和 Lesson 18（语义压缩）出场。

---

## ✅ 一句话带走

> **`truncation: "auto"` 是生产应用的安全网——一行参数解决"历史太长 400 报错"的尴尬；但它是硬截断，丢了的内容就真没了。要保留语义，等第 18 课的 compaction。**
