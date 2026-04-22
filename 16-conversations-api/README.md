# Lesson 16 · Conversations API — 持久化对话

> 一句话总结：**一个永不过期的对话对象，OpenAI 帮你存，你只管用。**

Lesson 15 的 `previous_response_id` 解决了"代码简化"问题，但留了两个硬伤——**30 天 TTL** 和**链条只读**。
本课的 Conversations API 直接把对话升格成一个一级对象（`conv_xxx`），没有 TTL，支持 CRUD（create / retrieve / update / delete），还能独立管理里面的每一条 item。
你需要做的事只有两件：**建一个 conversation**、**每次调用 `responses.create()` 时带上 `conversation: conv.id`**。剩下 OpenAI 全包。

---

## 🎯 本课学完后你会

- 理解 **Conversations API** 的三个核心概念：`Conversation`、`Item`、`conversation` 参数
- 区分 **`previous_response_id`（Lesson 15）** 和 **Conversations API（Lesson 16）** 的**本质差异**——尤其是 TTL
- 熟练使用官方 SDK 的 8 个方法：create / retrieve / update / delete + items.list / items.retrieve / items.create / items.delete
- 读懂 `durable-chat.ts` 的 6 步演示脚本，每一步返回的对象长什么样
- 清楚**计费规则**：和 `previous_response_id` 完全一致——历史 token 每轮全量计费，存储免费但不打折
- 知道 `items.list` 返回顺序是**倒序（newest first）**，不是你直觉中的"聊天时间线"
- 判断什么场景用 Conversations API、什么场景用 `previous_response_id`、什么场景干脆自己上数据库

---

## 📦 目录结构

```
16-conversations-api/
├── durable-chat.ts   # 6 步演示：create → 2 轮对话 → list → retrieve → delete
└── README.md         # ← 你正在读这个
```

只有一个脚本，但它覆盖了 Conversations API 的完整生命周期。读完这个文件的代码 + 本 README，你就能在生产项目里直接上手。

---

## 🚀 运行

```bash
pnpm l16
```

前提：项目根目录有 `.env` 文件，里面设好了 `OPENAI_API_KEY`。

脚本会自动跑完 6 个步骤并在最后删除创建的 conversation（避免账号里堆垃圾）。如果你想**保留 conversation** 观察它、或者把 ID 写到数据库里跨会话复用，把 Step 6 的 `client.conversations.delete()` 注释掉即可。

---

## 📖 什么是 Conversations API？

从 2026 年开始，OpenAI Responses API 家族新增了 `conversations` 这一级资源。它是**平台侧的一等公民对象**，跟 `responses` / `files` / `assistants` 同级。

一个 **Conversation** 本质上是一个**可追加、可查询、可删除的消息容器**：

- 每次你调 `responses.create({ conversation: conv.id, input: [...] })`，OpenAI 会把**本轮的 user input** 和**本轮的 assistant output**（以及中间产生的 tool call / tool result 等）一股脑**追加到这个 Conversation 的 items 列表里**。
- 下一次再调 `responses.create({ conversation: conv.id, ... })`，OpenAI 会**自动把 Conversation 里所有 items 拼成完整历史**送给模型——你只需要传本轮的新消息。

和 `previous_response_id` 的链表结构不同，Conversation 是一个**平铺的 items 列表**：

```
Conversation (conv_xxx)
├── item 1: message (role=user)   "你好，我叫 Alice"
├── item 2: message (role=assistant) "你好 Alice..."
├── item 3: message (role=user)   "我叫什么？"
├── item 4: message (role=assistant) "你叫 Alice..."
├── item 5: function_call          (如果有工具调用)
├── item 6: function_call_output   (工具执行结果)
└── ... 随便往后加
```

### 关键特性（官方文档原话）

> **Conversation objects and items in them are not subject to the 30 day TTL.**
>
> Any response attached to a conversation will have its items persisted with no 30 day TTL.

翻译：**只要你把 response 挂到 conversation 上，items 就永久保存——没有 30 天过期**。这是和 Lesson 15 的 `previous_response_id` 最核心的区别。

---

## 🆚 和 `previous_response_id` 的本质区别

先看一张对比表，后面再逐项展开。

| 维度 | `previous_response_id`（Lesson 15） | Conversations API（Lesson 16） |
|---|---|---|
| 存储位置 | OpenAI 服务端（按 response 独立存） | OpenAI 服务端（按 conversation 聚合存） |
| TTL（过期时间） | **30 天**，过期链条断裂 | **无 TTL**，永久保留 |
| 数据结构 | 单链表（每个 response 指向上一个） | 平铺列表（conversation 装多个 items） |
| 代码复杂度 | 极低（维护一个 `prevId` 变量） | 极低（维护一个 `convId` 字符串） |
| 计费 | 历史 input tokens 每轮全量计费 | **完全一致**——历史 input tokens 每轮全量计费 |
| CRUD 支持 | 只读（无法修改、无法删除中间某条） | **完整 CRUD**：create / retrieve / update / delete，items 也能单独增删查 |
| 跨会话复用 | 需要把 `resp_xxx` 存数据库 + 30 天内 | **把 `conv_xxx` 存数据库即可，永久有效** |
| 元数据 | 无法自定义 | 可以 `update(convId, { metadata: {...} })` |
| 适合场景 | 快速原型、短期聊天、demo | **生产应用**、长期对话、账号体系、多设备同步 |

### 重点区别一：TTL

这一点怎么强调都不过分。

**`previous_response_id`**：OpenAI 把每个 response 单独存，30 天后自动删。如果你的链是 `r1 → r2 → r3 → ... → r100`，只要任何一环（比如 `r50`）过期了，`r51` 拿着一个找不到的 `previous_response_id` 就会报 `response not found`——**整条链就断了**。

**Conversations API**：所有 items 聚合在 conversation 容器里，**没有 30 天的自动清理**。一年后你拿着 `conv_xxx` 来接着聊，依然能看到去年的所有对话。

### 重点区别二：数据结构

**`previous_response_id`** 是链表，只能往后追加、不能修改中间节点。如果你想"删掉第 3 轮的那个回答"或者"在第 5 轮之前插入一条系统提示"——做不到，只能从头重新拉一条链。

**Conversations API** 是一个 items 容器，SDK 提供了完整的 CRUD：

```ts
// 增加 item
await client.conversations.items.create(convId, { items: [...] });

// 删除特定 item
await client.conversations.items.delete(itemId, { conversation_id: convId });

// 列出所有 items（支持分页）
const items = await client.conversations.items.list(convId);
```

你可以在生产环境里给每个用户的 conversation 做"软删除消息"、"编辑历史"、"导出对话"等操作，而不需要自己在数据库里镜像一份。

### 重点区别三：计费

**Conversations API 不省钱。**

很多人第一眼看到"对话对象"会以为——既然 OpenAI 都帮我存了，是不是多轮对话的 input tokens 会有缓存折扣？

**没有。**

不管你用 `previous_response_id` 还是 Conversations API，**每一轮请求，OpenAI 都会把完整历史作为 input 送入模型，按当前模型的 input token 价格全量计费**。存储是免费的，但 token 一分不少。

看看 `durable-chat.ts` 实际运行输出：

```
--- Step 2: 第 1 轮对话 ---
  [input_tokens: 34]         ← 第 1 轮只有 instructions + 1 条 user 消息

--- Step 3: 第 2 轮对话 ---
  [input_tokens: 86]         ← 第 2 轮包含第 1 轮的 user + assistant + 本轮 user
```

从 34 → 86 的增长，和 Lesson 15 里 36 → 79 → 114 的趋势完全一致。**这是多轮对话的固有成本，和你选哪个 API 无关**。

### 那 Conversations API 比 `previous_response_id` 好在哪？

**好在"它是一个持久对象，而不是一条转瞬即逝的链"。**

想象你做一个 ChatGPT-like 产品：

- 用户 A 的对话列表里有 50 条历史对话
- 用户 A 切换到平板，想继续昨天那条对话
- 30 天后用户 A 回来，翻 3 个月前的对话

如果你用 `previous_response_id`，这三个需求都很难——每条对话的最新 response ID 要自己存数据库、30 天过期要自己处理、切换设备要自己同步。

如果你用 Conversations API：**给每条对话建一个 `conv_xxx`，把 ID 存到你的数据库里就完事了。** 永不过期、跨设备直接拿 ID 调 API、查询历史用 `items.list`。

---

## 🔧 核心代码详解（`durable-chat.ts`）

### Step 1 · 创建 Conversation

```ts
const conversation = await client.conversations.create();
console.log(`  conversation.id: ${conversation.id}`);
console.log(`  object: ${conversation.object}`);
```

实际输出：

```
  conversation.id: conv_69e7b0d8dbc48197b14f1d2cd2e565a5098b5b5e3e1a7027
  object: conversation
```

- **`conversations.create(body?)`** 参数都是可选的。最常用的可选字段是 `metadata`（一个 `Record<string, string>`），你可以塞入诸如 `userId` / `title` / `tags` 之类的业务元数据。
- 返回的 `conversation` 对象至少包含：
  - `id`：格式 `conv_` 开头的字符串，**这是你唯一需要记住的东西**
  - `object: "conversation"`
  - `created_at`：Unix 秒级时间戳
  - `metadata`：你传进来的 metadata 原样回显

把这个 `id` 存到数据库里（MongoDB / Postgres / Redis 随便），以后任何时候拿出来继续对话都可以。

### Step 2 · 第 1 轮对话（绑定 conversation）

```ts
const r1 = await client.responses.create({
  model: MODEL,
  instructions: "你是一个友好的中文助手，回答简短。",
  input: [{ role: "user", content: "你好，我叫 Alice，我是全栈工程师。" }],
  conversation: conversation.id,   // ★ 本课的核心参数
});
```

和 Lesson 15 的唯一区别是：**把 `previous_response_id: r1.id` 换成 `conversation: conversation.id`，去掉 `store: true`**（带 `conversation` 参数时隐含存储）。

几个关键点：

1. **`input` 只传本轮新消息**，不需要拼历史——OpenAI 会自动从 conversation 里捞出所有历史 items 拼起来。
2. **`instructions` 相当于 system prompt**。注意：instructions 不会被存到 conversation 里作为 item；它是每次请求级的"系统提示"。如果你想让后续轮也生效，每次都要重复传。
3. **不用传 `store: true`**。当你指定 `conversation` 时，response 会自动绑定到该 conversation 并持久化。

输出：

```
User: 你好，我叫 Alice，我是全栈工程师。
AI:   你好，Alice！...
  [input_tokens: 34]
```

### Step 3 · 第 2 轮对话（继续同一个 conversation）

```ts
const r2 = await client.responses.create({
  model: MODEL,
  input: [{ role: "user", content: "我叫什么？做什么工作？" }],
  conversation: conversation.id,
});
```

注意：

- **不需要 `previous_response_id`**——conversation 自己就是上下文的聚合。
- **不需要再传 `instructions`**——如果你想让之前的 system prompt 继续生效，要再传一次；不传就只用 conversation 里的 items 作为上下文。
- AI 能答出 "Alice" 和 "全栈工程师"——证明历史上下文确实被自动拼接了。

输出：

```
User: 我叫什么？做什么工作？
AI:   你叫 Alice，你是全栈工程师。
  [input_tokens: 86]
```

86 个 tokens——比第一轮多了 52 个——这些都是历史。**永远不要幻想多轮对话不涨费**。

### Step 4 · 列出 conversation 中的所有 items

```ts
const items = await client.conversations.items.list(conversation.id);
for await (const item of items) {
  // item.type: "message" | "function_call" | "function_call_output" | ...
  // item.role: "user" | "assistant" | "system" (仅 message 类型)
  // item.content: 消息内容数组
}
```

**重要**：`items.list()` 返回的是一个 **AsyncIterable**（SDK 自动处理分页），用 `for await` 遍历最方便。

实际输出：

```
--- Step 4: 列出对话中的 items ---
  1. role=assistant, type=message, preview=你叫 Alice，你是全栈工程师...
  2. role=user, type=message, preview=我叫什么？做什么工作？...
  3. role=assistant, type=message, preview=你好，Alice！...
  4. role=user, type=message, preview=你好，我叫 Alice，我是全栈工程师...
  共 4 条 items
```

**⚠️ 注意顺序：`items.list` 默认返回 "newest first"（最新的在前）。**

上面的输出里，第 1 条是 Step 3 的 assistant 回复，最后一条才是 Step 2 最早的 user 消息。这个**倒序**很容易踩坑——很多人第一次拿到列表会以为顺序反了。

如果你想按时间正序渲染消息（像聊天 UI 那样），要么在客户端 reverse 一下，要么传 `order: "asc"` 参数（SDK 支持）：

```ts
const items = await client.conversations.items.list(conversation.id, {
  order: "asc",  // 正序：oldest first
});
```

### Step 5 · 检索 conversation 元信息

```ts
const retrieved = await client.conversations.retrieve(conversation.id);
console.log(`  id: ${retrieved.id}`);
console.log(`  object: ${retrieved.object}`);
console.log(`  created_at: ${new Date(retrieved.created_at * 1000).toISOString()}`);
```

`conversations.retrieve(convId)` **只返回 conversation 对象的元数据**（id、object、created_at、metadata），**不返回 items**。想要 items，必须走 `items.list()`——两者是分开的。

这个设计合理：一个 conversation 可能有几千条 items，不能每次 retrieve 都全量拉回来。

### Step 6 · 删除 conversation

```ts
const deleted = await client.conversations.delete(conversation.id);
console.log(`  deleted: ${JSON.stringify(deleted)}`);
```

实际输出：

```
  deleted: {"id":"conv_69e7b0d8dbc48197b14f1d2cd2e565a5098b5b5e3e1a7027","object":"conversation.deleted","deleted":true}
```

**删除操作是永久的**——conversation 和它所有的 items 都会被彻底清除。**没有回收站，没有软删除**。

如果你想做"用户删除对话"的功能，建议在自己的数据库里先打一个 `deleted_at` 软删除标记，延迟几天之后再真的调 `conversations.delete()`——给用户反悔的机会。

---

## 🧰 完整 API 表（openai npm v6.34.0 已验证）

Conversations API 提供了两组对象方法：

### Conversation 级别

| 方法 | 签名 | 作用 |
|---|---|---|
| `client.conversations.create(body?)` | 返回 `Conversation` | 创建新 conversation，可选传 `metadata` |
| `client.conversations.retrieve(convId)` | 返回 `Conversation` | 获取元数据（不含 items） |
| `client.conversations.update(convId, body)` | 返回 `Conversation` | 更新元数据（目前主要用于改 `metadata` 字段） |
| `client.conversations.delete(convId)` | 返回 `{ id, object, deleted }` | 永久删除 conversation 及其所有 items |

### Item 级别

| 方法 | 签名 | 作用 |
|---|---|---|
| `client.conversations.items.list(convId, params?)` | 返回 AsyncIterable\<Item\> | 分页列出 items，支持 `order` / `limit` / `after` |
| `client.conversations.items.retrieve(itemId, params)` | 返回单个 Item | 获取某条 item 的完整内容；必须传 `conversation_id` |
| `client.conversations.items.create(convId, params)` | 返回新增的 items | 手动往 conversation 里塞 items（不通过 responses.create） |
| `client.conversations.items.delete(itemId, params)` | 返回删除结果 | 删除某条 item；必须传 `conversation_id` |

### 典型用法：用 metadata 做业务标注

```ts
// 创建时带 metadata
const conv = await client.conversations.create({
  metadata: {
    userId: "user_123",
    title: "关于 TypeScript 的讨论",
    createdFrom: "mobile-app",
  },
});

// 后续更新 title
await client.conversations.update(conv.id, {
  metadata: {
    userId: "user_123",
    title: "TypeScript 深入聊天",  // ← 改了标题
    createdFrom: "mobile-app",
  },
});
```

**注意**：update 传的 `metadata` 是**整体替换**，不是 merge。要保留的字段必须一起传。

### 典型用法：手动塞 items（不走 responses.create）

有时候你想把一段"外部对话"或者"虚构上下文"塞进 conversation，而不是真的调模型。这时用 `items.create`：

```ts
await client.conversations.items.create(conv.id, {
  items: [
    {
      type: "message",
      role: "system",
      content: [{ type: "input_text", text: "以下是用户的身份背景信息" }],
    },
    {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "我是一个高级工程师" }],
    },
  ],
});
```

之后调 `responses.create({ conversation: conv.id, ... })` 时，这些 items 就成了上下文的一部分。

---

## 🔄 跨会话继续对话

这是 Conversations API **相对于 `previous_response_id` 最实用的优势**。

### 场景：用户昨天聊了一半，今天回来继续

```ts
// === 昨天 ===
const conv = await client.conversations.create();
await db.save({ userId, convId: conv.id });   // ★ 存到你自己的数据库

await client.responses.create({
  conversation: conv.id,
  input: [{ role: "user", content: "帮我起草一封辞职信" }],
});
// ... 用户聊了几轮就关掉了

// === 今天（新进程、新设备、甚至新账号登录同一个 user） ===
const { convId } = await db.load({ userId });   // ★ 从数据库拿回 ID

await client.responses.create({
  conversation: convId,
  input: [{ role: "user", content: "把辞职信改得更委婉一些" }],
});
// AI 完全记得昨天的辞职信内容
```

**对比 `previous_response_id`**：要做到这个，你得把**每次的 `resp_xxx` 最新 ID** 存数据库，而且 30 天内必须有用户活动——不然过期就全断。**用 Conversations API 只存一个 `conv_xxx`，终身有效。**

### 场景：多设备同步

- 用户在手机上对话 → 存 `conv_xxx` 到后端
- 用户打开网页 → 拉 `conv_xxx`，调 `items.list()` 渲染历史
- 用户继续在网页上对话 → 传相同的 `conv_xxx`

OpenAI 服务端作为单一数据源，你不需要在多端之间同步对话内容。

### 示例 demo 为什么不演示跨会话？

因为 `durable-chat.ts` 是一次性脚本，跑完就退出，也确实在 Step 6 把 conversation 删掉了。**跨会话是这个 API 的"核心产品价值"，但不是脚本能直接演示的——它需要持久化的数据库支持**。Lesson 19 会把它和 SQLite 搭起来做一个完整的例子。

---

## 🔑 常见坑

| 症状 | 原因 | 解 |
|---|---|---|
| 调 API 返回 `conversation conv_xxx not found` | conversation 已经被 `delete()` 掉了，或者 ID 打错了 | 检查数据库里存的 ID；如果是自己的测试脚本里删了，重新 `create()` 一个新的 |
| `items.list()` 返回的顺序和聊天时间线相反 | 默认 `order: "desc"`（newest first） | 渲染前自己 reverse，或者传 `order: "asc"` |
| 以为 conversation 里的对话是**免费**的 | Conversations API 只是**存储免费**，input tokens 依然全量计费 | 接受现实：和 `previous_response_id` 一样，历史每轮重新计费。想省钱用 Lesson 18 的压缩 |
| 隐私合规问题：对话永久保留 | **没有 30 天自动清理**是特性也是风险 | 在你自己的业务代码里，按 GDPR / 合规要求**主动调 `conversations.delete()`**——这是你的责任，不是 OpenAI 的 |
| 忘了传 `conversation: conv.id` 参数 | AI 会完全不记得历史 | 每一次 `responses.create()` 都要传；可以在自己的代码里封装一个 helper 统一加 |
| 同时传了 `conversation` 和 `previous_response_id` | 行为未定义，官方不建议混用 | 二选一：要么走 conversation，要么走 previous_response_id，别骑墙 |
| `instructions` 每轮都要重传吗？ | instructions 不会被存到 conversation 的 items 里 | 如果想让 system prompt 每轮生效，每次都传；或者用 `items.create()` 手动塞一条 role=system 的 item |
| 删除 conversation 后想恢复 | **删除是永久的**，OpenAI 不保留任何备份 | 在自己的数据库里做软删除层，延迟 N 天后再真删；或者在删除前调 `items.list()` 导出备份 |
| `update()` 后 metadata 丢了字段 | update 是**整体替换**不是 merge | 先 `retrieve()` 拿到当前 metadata，在内存里合并后再整体传回去 |

---

## 🤔 什么时候用 / 什么时候不用

### ✅ 适合用 Conversations API

- **生产级 AI 产品**：有账号体系、对话列表、历史记录功能（比如 ChatGPT clone、客服机器人、AI 伴侣）
- **跨设备 / 跨会话聊天**：用户在手机、网页、桌面端之间无缝切换
- **长期对话**：持续几周、几个月甚至几年的陪伴式对话
- **需要对历史做 CRUD 的场景**：删除特定消息、编辑历史、导出对话
- **对话元数据驱动**：需要按用户、标签、时间范围查询对话时，可以用 metadata

### ❌ 不适合用 Conversations API

- **一次性脚本、demo、CLI 工具**：用完就退出，不需要持久化——用 `previous_response_id`（Lesson 15）更轻
- **完全离线的本地应用**：不想让对话上传 OpenAI——必须自己维护历史数组（Lesson 03）或上自己的数据库（Lesson 19）
- **需要复杂查询的产品**：按关键词搜索消息、按 embedding 找相似对话、统计消息频次——OpenAI 没有提供这些能力，用自己的数据库（Lesson 19）+ 向量索引
- **需要精细控制上下文的场景**：summarize 旧消息、动态注入 RAG 检索结果、截断超长对话——这些需要你直接控制 `input` 数组，Conversations API 把这一层黑盒化了（Lesson 17 / 18 会讲怎么在自己管的数组上做）
- **对数据主权敏感的场景**（医疗 / 金融 / 政务）：数据必须在你自己的基础设施里——自建 DB（Lesson 19）

---

## 🧠 本课核心概念一图总结

```
                 手动 history 数组（Lesson 03）
                ┌────────────────────────┐
                │  你全权管理 history[]    │
                │  写入存储方案全自选      │
                │  可任意增删改截断        │
                │  完全离线也能跑          │
                └────────────────────────┘
                            │
                            ▼
             previous_response_id（Lesson 15）
                ┌────────────────────────┐
                │  OpenAI 存 response     │
                │  链表结构、只读          │
                │  30 天 TTL，会过期       │
                │  轻量、适合 demo         │
                └────────────────────────┘
                            │
                            ▼
             Conversations API（Lesson 16 · 本课）
                ┌────────────────────────┐
                │  OpenAI 存 conversation │
                │  平铺 items、支持 CRUD   │
                │  无 TTL，永久保留        │
                │  适合生产产品            │
                └────────────────────────┘
                            │
                            ▼
             自建数据库（Lesson 19）
                ┌────────────────────────┐
                │  完全自主 + 自由查询     │
                │  可离线、可合规          │
                │  成本：自己维护全部      │
                └────────────────────────┘
```

每一层都比上一层多一些"OpenAI 帮你做的事"，同时少一些"你自己能掌控的东西"。**没有银弹**——挑一个和你产品阶段匹配的就行。

---

## ✅ 一句话带走

> **Conversations API = `previous_response_id` 去掉 30 天 TTL，加上 CRUD——是 `previous_response_id` 之后的自然升级，也是生产级 AI 产品最省事的对话状态方案。但 token 费用一分不省，且对话永久保留需要你主动合规清理。**
