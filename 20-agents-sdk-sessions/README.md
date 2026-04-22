# Lesson 20 · Agents SDK Sessions — 高级会话抽象

> 一句话总结：**把前 19 课手写的"history 管理 + Conversations + compact"全部打包进官方 SDK 的 `Session` 抽象，一个 `run(agent, input, { session })` 搞定一切。**

前 19 课我们把 OpenAI Responses API 几乎拆了个底朝天：
- Lesson 03 手写 `history[]` 数组维护上下文
- Lesson 15 用 `previous_response_id` 链
- Lesson 16 用 Conversations API 服务端持久化
- Lesson 17 学 `truncation` 防爆
- Lesson 18 学 `responses.compact` 自动摘要
- Lesson 19 用 SQLite 自己做数据库

**底层原理已经彻底搞明白了。**
这一课我们往上爬一层——用 OpenAI 官方的 TypeScript Agents SDK（`@openai/agents`），看看这些**手写逻辑被抽象成什么样**。核心工具就叫 `Session`，内置 3 种实现，分别对应我们前面学过的 3 种存储方式。

---

## 🎯 本课学完后你会

- 理解什么是 `@openai/agents`，它在 Responses API 之上提供了哪些抽象
- 掌握 `Session` 接口：`getSessionId` / `getItems` / `addItems` / `popItem` / `clearSession`
- 会用 **`MemorySession`** —— 进程内存 Session（demo / test 用）
- 会用 **`OpenAIConversationsSession`** —— 服务端持久化 Session（生产用）
- 会用 **`OpenAIResponsesCompactionSession`** —— 自动压缩 Session（长对话 / Agent loop 用）
- 清楚三种 Session 的**存储位置、跨进程能力、压缩能力、适用场景**
- 知道什么时候该用 Agents SDK，什么时候该直接用 `openai` 裸 API（Lesson 15-18 的做法）
- 能把这 3 种 Session 跟前 19 课手写的对应实现**一一对应起来**

---

## 📦 目录结构

```
20-agents-sdk-sessions/
├── memory-session.ts          # Part A：MemorySession 演示
├── conversations-session.ts   # Part B：OpenAIConversationsSession 演示
├── compaction-session.ts      # Part C：OpenAIResponsesCompactionSession 演示
└── README.md                  # ← 你正在读
```

---

## 🚀 运行

```bash
# A · MemorySession（进程内存）
pnpm l20:memory

# B · OpenAIConversationsSession（服务端持久化）
pnpm l20:conv                       # 新对话
pnpm l20:conv <conv_xxx>            # 继续已有对话

# C · OpenAIResponsesCompactionSession（自动压缩）
pnpm l20:compact
```

> 前提：项目根目录有 `.env`，设好了 `OPENAI_API_KEY`。
> 依赖：`@openai/agents` 已在 `package.json` 里（当前版本 `^0.8.5`）。

---

## 📖 什么是 `@openai/agents`？

`@openai/agents` 是 OpenAI 官方维护的 **TypeScript Agents SDK**（npm 包名就是 `@openai/agents`，当前版本 `0.8.5`）。文档：<https://openai.github.io/openai-agents-js/>。

它**不是**另一个 HTTP 客户端——底层还是我们熟悉的 Responses API。它给你的是一堆**高级抽象**，让你少写几百行"胶水代码"：

| 抽象 | 负责的事 | 对应前课手写的东西 |
|---|---|---|
| `Agent` | AI 人设 + 模型 + instructions + tools | Lesson 12 里散落在各处的配置 |
| `Session` | 对话历史 / 上下文管理 | Lesson 03 手写的 `history[]` + Lesson 16 的 conversationId 追踪 |
| `Tool` | 工具定义 + 参数 schema + executor | Lesson 07 / 12 的 tools 数组 |
| `Handoff` | Agent 之间的交接 | 本课暂不涉及 |
| `run()` | 跑一个回合（含 agent loop） | Lesson 12 手写的 `while (true) { create -> runTool -> push }` |

一行核心代码长这样：

```ts
import { Agent, MemorySession, run } from "@openai/agents";

const agent = new Agent({
  name: "Assistant",
  model: "gpt-5.4-nano",
  instructions: "你是助手",
});
const session = new MemorySession();

const result = await run(agent, "user message", { session });
console.log(result.finalOutput);
```

`run(agent, input, { session })` 会：
1. 从 `session.getItems()` 拿到历史
2. 拼上新的 `input`
3. 调用 Responses API
4. 把新的 user / assistant / tool items **自动** `addItems` 回 session
5. 如果触发 tool call，继续 agent loop，直到拿到 `finalOutput`

**对比 Lesson 12**（手写 agent loop）：少了 20+ 行样板代码。

---

## 🧩 `Session` 接口

所有 Session 都实现同一个接口（简化后）：

```ts
interface Session {
  getSessionId(): Promise<string>;
  getItems(limit?: number): Promise<AgentInputItem[]>;
  addItems(items: AgentInputItem[]): Promise<void>;
  popItem(): Promise<AgentInputItem | undefined>;
  clearSession(): Promise<void>;
}
```

5 个方法，意思都很直白：

- `getSessionId()` —— 返回这个会话的唯一 ID（比如 `OpenAIConversationsSession` 返回 `conv_xxx`）
- `getItems(limit?)` —— 读历史（按时间顺序，可限制条数）
- `addItems(items)` —— 往里塞 items（`run()` 内部会自动调用）
- `popItem()` —— 弹出最后一条（"撤销"最后一轮时用）
- `clearSession()` —— 清空所有历史

你**大部分时候不需要自己调这些方法**——`run()` 会在后台调。但了解接口很重要，因为：
- debug 的时候想看 session 里到底存了啥 → `getItems()`
- 想实现"重做上一轮"功能 → `popItem()`
- 想写自己的 Session（比如存 Redis / Postgres）→ 实现这 5 个方法即可

本课 3 个 demo 脚本都会调 `getItems()` 来展示"SDK 帮你存了啥"。

---

## 🅰️ Part A · `MemorySession`（进程内存 Session）

### 概念

`MemorySession` 把整个 history **放在一个 JS Map 里，存在当前进程的内存中**。进程一退出，全没了。

来源：`@openai/agents-core`，但是 `@openai/agents` 主包会 re-export 它，所以你只需要从 `@openai/agents` 导入即可。

**对应前课**：这就是 Lesson 03 那个 `const history: HistoryItem[] = []` 的面向对象封装版。

### API

```ts
new MemorySession({
  sessionId?: string,       // 可选，自动生成也行
  initialItems?: AgentInputItem[],  // 预置一些历史
})
```

一般不传参也能直接 `new MemorySession()`。

### 最小 demo（`memory-session.ts`）

```ts
import { Agent, MemorySession, run } from "@openai/agents";

const agent = new Agent({
  name: "FriendlyAssistant",
  model: "gpt-5.4-nano",
  instructions: "你是一个友好的中文助手，回答简短。",
});

const session = new MemorySession();
console.log(`session.getSessionId: ${await session.getSessionId()}`);

// Turn 1：告诉 AI 我的身份
const r1 = await run(agent, "你好，我叫 Charlie，我是自由职业设计师。", { session });
console.log(`AI: ${r1.finalOutput}`);

// Turn 2：AI 应该能记得
const r2 = await run(agent, "我叫什么？做什么工作？", { session });
console.log(`AI: ${r2.finalOutput}`);
// → "你叫 Charlie，是自由职业设计师。"

// 查一下 SDK 帮我们存了啥
const items = await session.getItems();
console.log(`items 数量: ${items.length}`);   // 一般是 4：user1 + assistant1 + user2 + assistant2

// 清空
await session.clearSession();

// Turn 3：清空后 AI 不记得了
const r3 = await run(agent, "我叫什么？", { session });
console.log(`AI: ${r3.finalOutput}`);
// → "抱歉，我还不知道你的名字。"
```

### 实际运行输出（摘录）

```
=== Lesson 20 · MemorySession 演示 ===

session.getSessionId: <auto-generated-uuid>

--- Turn 1 ---
User: 你好，我叫 Charlie，我是自由职业设计师。
AI:   你好 Charlie！很高兴认识一位自由职业设计师～

--- Turn 2 ---
User: 我叫什么？做什么工作？
AI:   你叫 Charlie，是一位自由职业设计师。

--- Session 里的 items ---
  items 数量: 4
  [0] {"role":"user","content":"你好，我叫 Charlie，我是自由职业设计师。"}
  [1] {"role":"assistant","content":[{"type":"output_text",...}]}
  [2] {"role":"user","content":"我叫什么？做什么工作？"}
  [3] {"role":"assistant","content":[{"type":"output_text",...}]}

--- 清空 Session ---
  clearSession() 后 items 数量: 0

--- Turn 3 (清空后) ---
User: 我叫什么？
AI:   抱歉，我还不知道你的名字。
```

看得见的效果：
1. **Turn 2 记得 Charlie / 自由职业设计师** —— 证明 `run` 自动把 Turn 1 的 items 塞进了 session，并在 Turn 2 时自动读出来拼成历史发给模型
2. **`getItems()` 返回 4 个 items** —— 对应 2 轮 user + 2 轮 assistant
3. **`clearSession()` 后 Turn 3 不记得** —— 一切都是内存对象，可以一键抹除

### 何时用 `MemorySession`

- ✅ 教学 / demo / 视频录制
- ✅ 单元测试 / 集成测试（每个 test case 一个干净 session）
- ✅ 短命 CLI 脚本（跑完就退）
- ❌ 生产环境（进程一挂就没了）
- ❌ 需要跨请求记忆的 Web 服务（除非你自己在内存里维护一个 `Map<userId, MemorySession>`，但这种时候不如用下面的 Conversations Session）

---

## 🅱️ Part B · `OpenAIConversationsSession`（服务端持久化 Session）

### 概念

这是 **Lesson 16 的 Conversations API 的 SDK 包装**。

历史**存在 OpenAI 服务端**，每一个 session 对应一个 `conv_xxx` ID。
好处：
- 程序重启 / 换机器 / 换用户设备，只要用同一个 `conversationId` 就能续聊
- 无 30 天 TTL（Lesson 15 的 `previous_response_id` 那种坑不会有）
- 可以在 OpenAI 控制台直接看对话历史

来源：`@openai/agents-openai`，同样被 `@openai/agents` 主包 re-export。

### API

```ts
new OpenAIConversationsSession({
  conversationId?: string,   // 可选。传了就继续旧对话；不传就首次 run 时自动创建
  client?: OpenAI,           // 可选自定义 SDK client
  apiKey?: string,           // 可选（默认读 env）
  // ...
})
```

关键行为：
- **不传 `conversationId`** → 首次 `run()` 会调 `conversations.create()` 新建一个
- **传了 `conversationId`** → 直接续聊那个对话
- `await session.getSessionId()` → 返回 `conv_xxx`（首次 run 后才有）

### 最小 demo（`conversations-session.ts`）

```ts
import { Agent, run, OpenAIConversationsSession } from "@openai/agents";

const agent = new Agent({
  name: "FriendlyAssistant",
  model: "gpt-5.4-nano",
  instructions: "你是一个友好的中文助手，回答简短。",
});

// 从命令行第三个参数读 conversationId（可选）
const argId = process.argv[2];
const session = new OpenAIConversationsSession({
  conversationId: argId,   // undefined 就首次 run 时自动创建
});

// Turn 1
const r1 = await run(
  agent,
  argId ? "我们之前聊到哪了？帮我总结一下。" : "你好，我叫 Dana，我在墨尔本做 AI 工程师。",
  { session }
);
console.log(`AI: ${r1.finalOutput}`);

// 拿到 conv_xxx（首次 run 之后才有）
const conversationId = await session.getSessionId();
console.log(`sessionId: ${conversationId}`);

// Turn 2
const r2 = await run(agent, "再问一下：我叫什么？在哪个城市？", { session });
console.log(`AI: ${r2.finalOutput}`);
```

### 实际运行输出（摘录）

首次运行 `pnpm l20:conv`：

```
=== Lesson 20 · OpenAIConversationsSession 演示 ===

将自动创建新对话

--- Turn 1 ---
AI: 你好 Dana！在墨尔本做 AI 工程师听起来很棒～

sessionId (conv_xxx): conv_abcdef123456...

--- Turn 2 ---
AI: 你叫 Dana，在墨尔本工作。

--- Session 里的 items ---
  items 数量: 4
  [0] {"role":"user","content":"你好，我叫 Dana..."}
  ...

=== 要点总结 ===
1. 底层是第 16 课的 Conversations API（conv_xxx）
2. 程序重启后，用同一个 conversationId 即可续聊
3. 下次继续：pnpm l20:conv conv_abcdef123456...
```

第二次运行时，把打印出来的 `conv_xxx` 作为参数传回去：

```bash
pnpm l20:conv conv_abcdef123456...
```

```
继续已有对话: conv_abcdef123456...

--- Turn 1 ---
AI: 我们聊到你是 Dana，在墨尔本做 AI 工程师。
```

**惊艳点**：程序已经完全退出再启动，AI 依然"记得"你是谁。对比 Part A 的 `MemorySession`，这才是**生产可用**的方案。

### 底层原理

```
┌────────────────────────────────────────────────────┐
│   你的代码                                         │
│   new OpenAIConversationsSession({ conversationId })│
└────────────────────────────────────────────────────┘
                      │
                      ▼
┌────────────────────────────────────────────────────┐
│   @openai/agents 内部                              │
│   run(agent, input, { session })                   │
│     → client.conversations.items.list(convId)      │  ← 拿历史
│     → client.responses.create({                    │  ← 建响应
│         conversation: convId,                      │
│         input: newItems,                           │
│         store: true,                               │
│       })                                           │
└────────────────────────────────────────────────────┘
                      │
                      ▼
              Lesson 16 你手写过的 API
```

换句话说：**SDK 帮你封装了 Lesson 16 的 `conversations.create` + `conversations.items.list` + `responses.create({ conversation })` 这一套**。

### 何时用 `OpenAIConversationsSession`

- ✅ 生产环境多轮聊天（Web 应用 / App）
- ✅ 需要跨设备 / 跨请求记忆
- ✅ 想让运营在 OpenAI 控制台回看对话
- ✅ 不想自建数据库（对比 Lesson 19 手写 SQLite）
- ❌ 对隐私特别敏感的场景（历史都存 OpenAI 服务端）
- ❌ 需要完全自定义存储逻辑（比如加密 / 多租户隔离）—— 这时自己实现 Session 接口 + Lesson 19 的 DB 方案

---

## 🆑 Part C · `OpenAIResponsesCompactionSession`（自动压缩 Session）

### 概念

这个名字很长，但它的作用可以用**一个词**概括：**装饰器（decorator）**。

它不是一个独立的存储方案，而是**包在别的 Session 外面**，给它加上"自动压缩"能力：

```
┌────────────────────────────────────────┐
│ OpenAIResponsesCompactionSession        │ ← 检测到 items 多了 → 调 responses.compact
│   ┌──────────────────────────────────┐  │
│   │ underlyingSession: MemorySession │  │ ← 真正存数据的地方
│   └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

**对应前课**：这是 Lesson 18 的 `responses.compact` 的 SDK 自动化版——Lesson 18 你得自己判断"什么时候该压缩"，这里 SDK 帮你判断并调用。

⚠️ **重要限制**：按官方文档，它**不支持包裹 `OpenAIConversationsSession`**（因为 Conversations API 自己有另一套 compaction 机制）。通常用 `MemorySession` 或你自己实现的 Session。

### API

```ts
new OpenAIResponsesCompactionSession({
  model: "gpt-5.4-nano",
  underlyingSession: new MemorySession(),

  // 可选：什么时候触发压缩
  shouldTriggerCompaction?: ({ compactionCandidateItems, sessionItems }) => boolean | Promise<boolean>,
  // 默认：compactionCandidateItems.length >= 10

  // 可选：压缩模式
  compactionMode?: "auto" | "previous_response_id" | "input",
  // 默认："auto"
})
```

#### `compactionMode` 三种模式

参考官方文档 <https://openai.github.io/openai-agents-js/>：

| 模式 | 行为 |
|---|---|
| `"auto"`（默认） | 智能选择：如果上一次响应是 `store: true`，用 `previous_response_id`；否则用 `input` |
| `"previous_response_id"` | 总是用 previous_response_id 模式：依赖服务端响应链（Lesson 15 那种） |
| `"input"` | 总是用 input 模式：SDK 把本地 session items 全部作为 `input` 发回去 |

新手直接用默认 `"auto"` 就够了。

#### `shouldTriggerCompaction` 参数含义

传进函数的 `compactionCandidateItems` 是**可被压缩的 items**（一般不包括最近几条和当前这条），`sessionItems` 是当前 session 全量 items。

默认逻辑大致：**一旦候选 items ≥ 10 就触发**。

### 最小 demo（`compaction-session.ts`）

为了让触发肉眼可见，我们故意把阈值调到 **3**：

```ts
import { Agent, MemorySession, OpenAIResponsesCompactionSession, run } from "@openai/agents";

const agent = new Agent({
  name: "FriendlyAssistant",
  model: "gpt-5.4-nano",
  instructions: "你是一个友好的中文助手，回答简短。",
});

const session = new OpenAIResponsesCompactionSession({
  model: "gpt-5.4-nano",
  underlyingSession: new MemorySession(),
  // 演示用：阈值 3（正常用默认 10）
  shouldTriggerCompaction: ({ compactionCandidateItems }) => {
    return compactionCandidateItems.length >= 3;
  },
});

const questions = [
  "你好，我叫 Eve，我在东京做游戏开发。",
  "我最喜欢的游戏类型是 roguelike。",
  "我正在做一款关于海洋探险的游戏。",
  "这个海洋游戏我想用 Unity 还是 Unreal？",
  "能帮我一句话总结：我是谁、在哪、做什么、喜欢什么游戏吗？",
];

for (let i = 0; i < questions.length; i++) {
  const result = await run(agent, questions[i], { session });
  console.log(`AI: ${result.finalOutput}`);

  const items = await session.getItems();
  const compactionCount = items.filter((it) => (it as any).type === "compaction").length;
  if (compactionCount > 0) {
    console.log(`[✓ 检测到 ${compactionCount} 个 compaction item]`);
  }
}

// 手动强制再压缩一次
const result = await session.runCompaction({ force: true });
console.log(result ? "执行了一次强制压缩" : "没有可压缩的内容");
```

### 实际运行输出（摘录）

```
=== Lesson 20 · OpenAIResponsesCompactionSession 演示 ===

--- Turn 1 ---
User: 你好，我叫 Eve，我在东京做游戏开发。
AI:   你好 Eve！东京的游戏开发氛围一定很棒～
  [session items: 2]

--- Turn 2 ---
User: 我最喜欢的游戏类型是 roguelike。
AI:   roguelike 不错！你有最喜欢的作品吗？
  [session items: 4]

--- Turn 3 ---
User: 我正在做一款关于海洋探险的游戏。
AI:   听起来很酷！水下世界有独特的氛围优势。
  [session items: 7]
  [✓ 检测到 1 个 compaction item]   ← ★ 压缩在这里触发了

--- Turn 4 ---
User: 这个海洋游戏我想用 Unity 还是 Unreal？
AI:   ...
  [session items: 9]
  [✓ 检测到 1 个 compaction item]

--- Turn 5 ---
User: 能帮我一句话总结：我是谁、在哪、做什么、喜欢什么游戏吗？
AI:   你是 Eve，在东京做游戏开发，喜欢 roguelike，正在做一款海洋探险游戏。
  [session items: 11]
  [✓ 检测到 2 个 compaction item]

--- 手动强制压缩 runCompaction({ force: true }) ---
  runCompaction 结果: 执行了压缩
```

看得见的效果：
1. **Turn 3 之后 session 里出现了 `type: "compaction"` 的 item** —— SDK 自动帮你调了 `responses.compact`
2. **Turn 5 依然能正确回忆所有细节**（Eve / 东京 / 游戏开发 / roguelike / 海洋探险）—— 说明压缩后的摘要是有效的上下文
3. **`runCompaction({ force: true })` 可以手动触发** —— 如果你想在一个关键节点（比如"对话结束前"）强制压缩一次

### 底层原理

```
run(agent, input, { session: compactionSession })
  │
  ▼
compactionSession.getItems()
  → underlyingSession.getItems() + 已有的 compaction items
  │
  ▼
Responses API call
  │
  ▼
compactionSession.addItems(newItems)
  → underlyingSession.addItems(newItems)
  → 检查 shouldTriggerCompaction({ compactionCandidateItems, sessionItems })
      ├─ false → 什么都不做
      └─ true  → 调 client.responses.compact(...)  ← Lesson 18
                 把结果作为 "compaction" item 加进 session
```

### 何时用 `OpenAIResponsesCompactionSession`

- ✅ 长对话 / Agent loop 导致 token 逐轮爆涨
- ✅ 想让 SDK 自动管理上下文窗口，不用你写截断 / 摘要逻辑
- ✅ 需要微控触发条件（通过 `shouldTriggerCompaction`）
- ❌ 短对话（默认 10 个 items 才触发，没意义）
- ❌ 想包一个 `OpenAIConversationsSession`（**不支持**，官方明确禁止）

---

## 🆚 三种 Session 对比

| Session | 存储位置 | 跨进程 | 自动压缩 | 底层 API | 适用场景 |
|---|---|---|---|---|---|
| `MemorySession` | 进程内存（JS Map） | ❌ | ❌ | 无（纯本地） | demo / test / 教学 |
| `OpenAIConversationsSession` | OpenAI 服务端 | ✅ | ❌ | Conversations API（L16） | 生产 Web 应用 |
| `OpenAIResponsesCompactionSession` | 依赖 `underlyingSession` | 依赖 underlying | ✅ | `responses.compact`（L18） | 长对话 / Agent loop |

**组合建议**：
- 教学写 demo：`MemorySession`
- 生产聊天机器人：`OpenAIConversationsSession`
- 生产长对话 agent（几十轮）：先看 Conversations API 自带的 compaction 够不够；不够就用 `OpenAIResponsesCompactionSession` 包一个自定义 Session（比如 Redis 存储）

---

## 🔗 三种 Session 对应前 19 课的哪些手写实现

这是本课最有价值的一张表——它告诉你**每个 SDK 抽象其实就是某一课手写过的东西**：

| SDK 抽象 | ≈ 前课手写版本 | 主要区别 |
|---|---|---|
| `MemorySession` | Lesson 03 `const history: HistoryItem[] = []` + push | SDK 帮你自动 push user/assistant/tool items，并处理好 items 类型 |
| `OpenAIConversationsSession` | Lesson 16 `conversations.create()` + `conversations.items.list()` + `responses.create({ conversation })` | SDK 帮你串好三个 API 调用，封装成 `getItems()` / `addItems()` 接口 |
| `OpenAIResponsesCompactionSession` | Lesson 18 `auto-compact.ts` —— 手写"items 超过 N 就调 compact" | SDK 帮你做决策（`shouldTriggerCompaction`）+ 调度（`runCompaction`）+ 存 compaction item |
| `Agent` + `run()` | Lesson 12 手写的 `while (true) { create -> runTool -> push }` agent loop | SDK 内置 agent loop，tools 自动注册，multi-turn / handoffs 都是一个 `run()` |

**底层还是 Responses API。** SDK 省的是样板代码，不是 API 调用数量或 token 费用。

---

## 🤔 什么时候用 Agents SDK vs 裸 `openai` SDK（Lesson 15-18 的做法）？

这是新手最容易纠结的问题。简单判断：

### 用 `@openai/agents`（本课）

- 🧠 要写**多轮 agent**（tools + agent loop + 可能的 handoffs）
- 🧠 想让**上下文管理自动化**（不想自己写 history 数组 / compact 逻辑）
- 🧠 想要**多 Agent 交接**（Handoff）或者 **Guardrails**
- 🧠 项目规模中等以上，愿意加一层官方抽象依赖

### 用裸 `openai` SDK（Lesson 15-18）

- 🧠 **学习底层原理**（就是前 19 课的路线！）
- 🧠 需要**完全自定义**每一个 API 参数 / request header / 重试策略
- 🧠 依赖最小化（不想多引一个 `@openai/agents`）
- 🧠 业务逻辑非标准（比如每轮要注入 RAG 检索结果、动态改 instructions）
- 🧠 写单次调用的脚本（总结 / 分类 / embeddings），根本用不到 agent / session

**底线**：这两条路不是二选一，是"入门时两条都要走一遍"。你已经走完了 Lesson 15-18 的底层路线——现在回过头来看 SDK 抽象，会觉得格外清晰。**如果先学 SDK 再去拆底层，就会陷入"为什么 run() 这样就能记忆？"的黑盒困惑。**

---

## 🔑 常见坑

| 症状 | 原因 | 解 |
|---|---|---|
| `Cannot find package '@openai/agents-openai'` | 你直接 `import { OpenAIConversationsSession } from "@openai/agents-openai"` | 从 `@openai/agents` 统一导入，主包会 re-export 所有 sub-packages |
| 压缩没触发 | 默认阈值是 **10 个候选 items**，短对话根本到不了 | 用 `shouldTriggerCompaction` 自定义阈值（或做 demo 时调到 3） |
| `OpenAIResponsesCompactionSession` 包 `OpenAIConversationsSession` 报错 / 行为异常 | **官方明确不支持**这种组合 | 只包 `MemorySession` 或自定义 Session |
| `session.getItems()` 返回空，但我明明调了 `run()` | `run()` 内部写 items 是异步的 | 先 `await run(...)` 拿到 result，再调 `getItems()` |
| 换到 `OpenAIConversationsSession` 后不知道 `conv_xxx` 怎么拿 | `await session.getSessionId()`，但必须在**第一次 `run()` 之后** | 首轮 `run()` 结束再读 sessionId |
| 第二次跑 `pnpm l20:conv` 想续聊，但没传 conv_xxx | 脚本里 `process.argv[2]` 是 undefined，会新建一个对话 | `pnpm l20:conv conv_abc123...` 带参数运行 |
| Agent 不会调我定义的 tool | `Agent` 配置里没传 `tools` 或 instructions 没说"该用 tool" | 在 `new Agent({ tools: [...], instructions: "天气必须用 get_weather" })` |
| 不确定什么时候用 SDK、什么时候用裸 API | —— | 见上一节"何时用 SDK vs 裸 API" |

---

## 🧠 本课的 4 层抽象

从底到顶：

```
┌─────────────────────────────────────────────────────┐
│ ④ Agent 业务逻辑：Agent + Session + run()           │  ← @openai/agents 主要 API
├─────────────────────────────────────────────────────┤
│ ③ Session 抽象：getItems / addItems / clearSession  │  ← MemorySession / OpenAIConversationsSession / OpenAIResponsesCompactionSession
├─────────────────────────────────────────────────────┤
│ ② Responses API 封装：conversations / compact ...   │  ← Lesson 16 / 18 你已手写
├─────────────────────────────────────────────────────┤
│ ① HTTP + SSE + 模型调用                              │  ← Lesson 14 你已手写
└─────────────────────────────────────────────────────┘
```

每一层你现在都见过了。以后别人说"用 Agents SDK 做个 agent"——你知道每一层在干什么、`run()` 背后发生了几次 HTTP 请求、`session` 里存的是什么格式的 item。

---

## 🧊 延伸阅读

- 官方文档：<https://openai.github.io/openai-agents-js/>
- npm：<https://www.npmjs.com/package/@openai/agents>
- Python 版本：<https://openai.github.io/openai-agents-python/>（跟 TS 版结构一致，概念可互通）
- Lesson 16 / Lesson 18 本项目 README 里的 API 对照

---

## ✅ 一句话带走

> **Agents SDK 的 `Session` 把前 19 课手写的 history / Conversations / compact 抽成 3 个等价的高级对象：`MemorySession`（内存）、`OpenAIConversationsSession`（服务端）、`OpenAIResponsesCompactionSession`（自动压缩）。底层还是 Responses API，SDK 帮你省的是样板代码——因为你已经手写过底层，现在才真正看得懂这个抽象。**
