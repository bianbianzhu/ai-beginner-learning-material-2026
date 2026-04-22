# Lesson 19 · DB-backed Conversations — 自建对话持久化

> 一句话总结：**把对话历史从 OpenAI 服务端搬到你自己的 SQLite 文件里——下班关机、第二天开机，AI 还记得昨天聊过什么。**

Lessons 15 和 16 都把历史托管给了 OpenAI：`previous_response_id` 靠服务端链表，Conversations API 靠服务端对象。这两条路都有一个共同前提——**你信任 OpenAI 来保管你的数据**。本课反过来：**历史完全存在本地的一张 SQLite 表里**，API 调用只是无状态的生成器，关掉程序重启也不丢上下文。

本课是整个"持久化光谱"的最后一站。读完后你会知道什么场景该用托管、什么场景该自建，以及自建其实只要 200 行代码。

---

## 🎯 本课学完后你会

- 明白为什么生产应用几乎**不会直接用** `previous_response_id` / Conversations API，而是选自建存储
- 会用 **`better-sqlite3` + `drizzle-orm`** 在 Node 里搭一个零依赖的本地对话数据库
- 掌握一个可直接抄走的 **schema 设计原则**：不自己发明对话格式，直接把 OpenAI 的 `ResponseItem` 以 JSON blob 存进去
- 会写三个最常见的持久化操作：`createConversation()` / `loadHistory()` / `appendItem()`
- 知道 `pnpm l19 list` 是怎么实现的，以及为什么 `ORDER BY position` 不能省
- 能在 Lessons 15 / 16 / 19 三种方案之间做出**有理有据**的选型

---

## 📦 目录结构

```
19-db-conversations/
├── db/
│   ├── schema.ts       # Drizzle ORM 表定义（conversations + items）
│   └── index.ts        # 打开 SQLite 文件 + CREATE TABLE IF NOT EXISTS
├── db-chat.ts          # CLI 主程序：新建/继续/列出对话
├── chat.db             # ★ 首次运行自动生成的 SQLite 文件（运行前不存在）
└── README.md           # ← 你正在读这个
```

没有前端、没有 Express、没有 agent loop——本课刻意**只聚焦持久化这一件事**，把它做干净。

---

## 🚀 运行

```bash
# 新开一段对话（程序会生成一个 UUID 给你）
pnpm l19

# 继续某段对话（把 UUID 传进来）
pnpm l19 9c3a1b7e-...

# 列出所有历史对话
pnpm l19 list
```

首次运行会在 `19-db-conversations/chat.db` 自动创建数据库文件。**这个文件就是你全部对话历史的真身**，拷贝走就带走了所有记忆，删掉就忘光了。

> 前提：项目根目录的 `.env` 里配好 `OPENAI_API_KEY`；`pnpm install` 已经把 `better-sqlite3` 和 `drizzle-orm` 装好了。

---

## 🧭 为什么要自建对话存储？

Lesson 15 和 16 都在用"OpenAI 替你管数据"的思路。对做 demo、写玩具脚本是够了，但一旦你要**上线真东西**，下面几件事基本没法绕开：

### 1. 数据主权（Data Sovereignty）

"我司的对话内容能不能存在 OpenAI 的服务器上？"——这是很多企业、政府、医疗、金融客户问的第一句话。
用 `previous_response_id` / Conversations API 时，**完整的 user + assistant 内容**都躺在 OpenAI 的 US 数据中心里 30 天起。自建 DB 的话，数据库文件在哪，数据就在哪——你可以放在 AWS Sydney region、放在内网 Postgres、放在客户的 on-prem 服务器。

### 2. 审计日志 / 合规

监管场景里经常要求"保留所有用户输入和 AI 输出 7 年"。30 天 TTL 的 `previous_response_id` 直接出局；Conversations API 虽然没 TTL，但你查历史还得调 `client.conversations.items.list()` 联网拉，不如本地一条 `SELECT` 快。

### 3. 自定义 SQL 查询

- "上个月哪些 user 的对话里出现了关键字 `refund`？"
- "平均每个 conversation 有多少轮？"
- "过去一周 tool call 最多的 conversation 是哪几个？"

这些分析都要求对话**躺在你自己的表里**。OpenAI 的托管方案不给你这种查询能力。

### 4. 离线可用 / 边缘部署

你想做一个 Electron 桌面 app，让用户在飞机上也能看到历史对话（当然接 AI 的瞬间还是要联网）。SQLite 文件跟 app 一起打包就完事了，托管方案做不到。

### 5. 绑定你的用户体系 / RBAC / 计费

- 把 `conversations.user_id` 外键到你自己的 `users` 表
- 按 `user_id` 做 RBAC：A 用户不能看 B 用户的对话
- 按 `conversations.billing_team_id` 做团队计费分摊

这些**业务层字段**都是你自己的事，OpenAI 的托管模型里没位置放。

### 6. 完全可控的生命周期

- "用户删号"——你能 `DELETE FROM conversations WHERE user_id = ?` 一键清干净
- "用户导出数据（GDPR）"——`SELECT ... INTO JSON` 一键导出
- "演示完 demo 自动归档"——加个 cron

托管方案里这些都得通过 API 一条条删/拉，还可能受到 rate limit。

> **底线**：托管方案教你认识"对话是什么"很好，但**生产系统里绝大多数场景都会落到自建存储**。本课就是教你怎么最轻量地迈出这一步。

---

## 🧰 技术选型：为什么是 SQLite + Drizzle？

这一课的核心是 AI 持久化，**不是数据库教学**。所以选型原则就一条：**学习曲线要陡、侵入感要低、能马上跑起来**。

### SQLite（通过 `better-sqlite3`）

- **零配置**：不需要装 server、不需要开端口、不需要配 `DATABASE_URL`
- **单文件**：`chat.db` 拷走就带走全部数据
- **同步 API**：`better-sqlite3` 是同步调用的，教学代码看起来和普通函数一样，不用到处 `await`
- **真快**：在本地文件读写上，SQLite 往往比 Postgres 还快（没网络、没序列化）
- **生产就绪**：别被"教学选型"骗了——WhatsApp、Expensify 等都在线上用 SQLite

局限也要说清楚：SQLite 不适合**多进程并发写入**的场景（比如多个 API server 同时写），那种情况上 Postgres 或 MySQL。但本课的 CLI 单进程写入，SQLite 完全够用。

### Drizzle ORM

- **TS-first**：表定义就是 TypeScript 对象，拿到结果就是带类型的行
- **不藏 SQL**：写出来的链式调用 `db.select().from(...).where(...)` 和原生 SQL 基本一一对应，不像某些 ORM 会偷偷帮你 join 一堆你没要的东西
- **轻量**：对比 Prisma，不需要额外的 `prisma generate` 步骤、不带 query engine 二进制、安装体积小一个数量级
- **Migration 可选**：教学里我们用 `CREATE TABLE IF NOT EXISTS` 一把梭，生产里可以随时接 `drizzle-kit push` 或 `drizzle-kit generate`

### 不用 migration 工具

教学阶段让启动代码自己跑一次 `CREATE TABLE IF NOT EXISTS` 就够了。好处是**零步骤**——用户 `pnpm l19` 就能跑，不用 `drizzle-kit push`、不用 `prisma migrate dev`。

生产环境请务必换成正经的 migration 工具，教学代码里也写了注释提醒。

---

## 🗃️ Schema 设计：不要发明你自己的对话格式

这是**整课最重要的一条原则**，请重点看：

```ts
// db/schema.ts
export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),         // 本地生成的 UUID
  title: text("title"),                 // 对话标题（可选）
  createdAt: integer("created_at").notNull(),
});

export const items = sqliteTable("items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id),
  position: integer("position").notNull(),   // 顺序（从 0 开始）
  itemJson: text("item_json").notNull(),     // ★ OpenAI ResponseItem 原样 JSON
  createdAt: integer("created_at").notNull(),
});
```

两张表，就这么简单：

1. **`conversations`**：每段对话一行，主键是本地 UUID（注意：**不是** OpenAI 的 `conv_xxx`——那是 Lesson 16 的事，本课完全不用）。
2. **`items`**：对话里每一条 item 一行，关键字段是 `item_json`——把 OpenAI `ResponseItem` 序列化后**原样塞进去**。

### 为什么 `item_json` 是一个整块 JSON，而不是拆成 role / content 列？

这是一个被反复踩过的坑。OpenAI 的 `ResponseItem` 远比"role + content"复杂：

- `{ role: "user", content: "..." }` ——最简单的消息
- `{ role: "assistant", content: [{ type: "output_text", text: "...", annotations: [...] }] }` ——带引用标注
- `{ type: "function_call", id: "...", call_id: "...", name: "...", arguments: "..." }` ——函数调用
- `{ type: "function_call_output", call_id: "...", output: "..." }` ——函数返回
- `{ type: "reasoning", id: "...", encrypted_content: "..." }` ——推理 item（Lesson 05）
- `{ type: "compaction", id: "...", encrypted_content: "..." }` ——压缩 item（Lesson 18）
- ……以及 2026 年 OpenAI 还在陆续加的新类型

如果你一开始"好心"把 schema 拆成 `role TEXT, content TEXT, tool_name TEXT, ...`，你会遇到：

| 尝试拆 schema 的代价 |
|---|
| OpenAI 加一个 `type: "xxx"`，你得加字段、跑 migration |
| 同一个物理 item 有时是字符串 content、有时是数组，你的列类型选什么都错 |
| `reasoning.encrypted_content` 里是 base64 的大块数据，塞哪个列好？ |
| round-trip 的时候你得写一堆 "行 → ResponseItem" 的转换胶水 |
| 胶水里有 bug，AI 的记忆就**悄悄坏掉**，还不报错 |

**反过来，把整个 item 存成 JSON blob 有几个直接的好处**：

- ✅ **Schema 稳定**：OpenAI 加新 item 类型，你的表一个字都不用改
- ✅ **Round-trip 完美**：`JSON.parse(JSON.stringify(item))` 出来的还是那个 item，没有任何损失
- ✅ **代码极简**：存的时候 `JSON.stringify`、读的时候 `JSON.parse`，完事
- ❌ **查询弱**：没法直接 `WHERE content LIKE '%refund%'`（不过 SQLite 的 `json_extract()` 其实也能用，本课不展开）

教学场景里 trade-off 是明显划算的：用一点点查询能力，换来**彻底不会因为 OpenAI 升级就要改 schema 跑 migration**的舒心。

> 这个原则适用范围远远超出本课——**每次你要持久化一个第三方 API 的复杂对象，都先考虑 JSON blob，不要急着拆字段**。等你的查询需求明确了再反向加索引 / 物化列，比一上来就拆要稳得多。

### `position` 字段：对话顺序的"保险丝"

SQLite 的 `items.id` 是 `AUTOINCREMENT` 的，直觉上用它排序就对了。但**不要这么做**：

- 如果你未来上 sharding / 分库，`id` 就不再单调递增
- 如果你要迁移到 Postgres，序列的实际行为和 SQLite 不一样
- 如果你有并发写入，两个 insert 的 `id` 谁大谁小不一定对应逻辑顺序

所以我们显式维护一个 `position`：每次 insert 前查一下当前 conversation 最大的 position，加 1。这样顺序语义**跟 primary key 解耦**，换数据库、加 sharding 都不受影响。

---

## 💻 代码走查

### `db/index.ts`：打开数据库 + 建表

```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

const DB_PATH = path.join(__dirname, "../chat.db");
const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");  // ★ 推荐配置

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS conversations (...);
  CREATE TABLE IF NOT EXISTS items (...);
  CREATE INDEX IF NOT EXISTS idx_items_conv_pos ON items(conversation_id, position);
`);

export const db = drizzle(sqlite, { schema });
```

三件事：

1. **打开 SQLite 文件**：`new Database(DB_PATH)`——文件不存在会自动创建
2. **开 WAL 模式**：Write-Ahead Log，读写并发更友好，是 SQLite 的推荐配置
3. **建表 + 建索引**：`idx_items_conv_pos` 很重要——后面 `loadHistory()` 要按 `(conversation_id, position)` 找行，没索引会全表扫

`drizzle(sqlite, { schema })` 把裸 SQLite 连接包一层，返回的 `db` 对象就能用 TS-safe 的链式 API 了。

### `db-chat.ts`：CLI 主程序

四个 DB 辅助函数 + 一个主循环。逐一看。

#### `nowUnix()`——时间戳 helper

```ts
function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}
```

用 Unix 秒（整数）存时间。相比存 ISO 字符串的好处：省空间、好排序、可做算术（`now - 7*86400` 即"7 天前"）。

#### `createConversation()`——新开一段对话

```ts
function createConversation(title?: string): string {
  const id = randomUUID();
  db.insert(schema.conversations)
    .values({ id, title: title ?? null, createdAt: nowUnix() })
    .run();
  return id;
}
```

调 Node 内置的 `crypto.randomUUID()` 生成 128-bit UUID（v4），冲突概率基本为 0。生成后直接 `INSERT`，返回这个 id。

注意 `db.insert(...).run()` 是 Drizzle 的一种运行方式——`.run()` 执行一条"不关心返回行"的 SQL（类似 INSERT / UPDATE / DELETE），返回值是受影响行数等元信息；相对地 `.all()` 用来取查询结果数组。

#### `loadHistory()`——把这段对话的所有 items 读回内存

```ts
function loadHistory(conversationId: string): ResponseInputItem[] {
  const rows = db
    .select()
    .from(schema.items)
    .where(eq(schema.items.conversationId, conversationId))
    .orderBy(asc(schema.items.position))   // ★ 必须！
    .all();
  return rows.map((r) => JSON.parse(r.itemJson) as ResponseInputItem);
}
```

两步：

1. **SELECT**：按 `conversation_id` 过滤 + **按 `position` 升序排**
2. **JSON.parse**：把每一行的 `item_json` 文本还原成 `ResponseInputItem` 对象

`ORDER BY position` 不是可选项——SQL 标准没有"自然顺序"，不加 `ORDER BY` 出来的行顺序是**未定义**的。这是非常容易翻的车。

#### `appendItem()`——追加一条 item 到对话尾部

```ts
function appendItem(conversationId: string, item: ResponseInputItem): void {
  const lastRows = db
    .select()
    .from(schema.items)
    .where(eq(schema.items.conversationId, conversationId))
    .orderBy(asc(schema.items.position))
    .all();
  const nextPos = lastRows.length === 0 ? 0 : lastRows[lastRows.length - 1].position + 1;

  db.insert(schema.items)
    .values({
      conversationId,
      position: nextPos,
      itemJson: JSON.stringify(item),
      createdAt: nowUnix(),
    })
    .run();
}
```

做法是"先查最大 position，再 insert"。教学代码就简单这么写，production 里应该：

- 改用 `SELECT MAX(position)` 单独一句，不 SELECT 全部行
- 或者把 `position` 列 default 到一个 subquery
- 并发写入高的场景用 transaction + 锁

对本课的 CLI 单进程场景，这种简单实现完全够用。

#### `listConversations()`——给 `pnpm l19 list` 用的

```ts
function listConversations() {
  const rows = db.select().from(schema.conversations).all();
  for (const row of rows) {
    const itemCount = db.select().from(schema.items)
      .where(eq(schema.items.conversationId, row.id)).all().length;
    console.log(`  ${row.id}  | items=${itemCount} | ...`);
  }
}
```

遍历所有对话，每个对话再查一下它有多少 items。教学用，写得很朴素。

#### 主循环

```ts
while (true) {
  const userInput = await rl.question("You: ");
  if (userInput.trim() === "/exit") break;

  // 1. 保存用户消息
  appendItem(conversationId, { role: "user", content: userInput });

  // 2. 从 DB 拉全部历史（包括刚存进去的那条）
  const history = loadHistory(conversationId);

  // 3. 调 API（无状态——OpenAI 不知道也不需要知道有 DB）
  const response = await client.responses.create({
    model: MODEL,
    input: history,
  });

  // 4. 保存 assistant 回复
  appendItem(conversationId, { role: "assistant", content: response.output_text });

  console.log(`AI : ${response.output_text}`);
}
```

每一轮的生命周期就这四步。**注意第 3 步对 `client.responses.create()` 的调用里没有 `previous_response_id`、没有 `conversation`——完全是 stateless 调用**。OpenAI 既不知道我们有 DB，也不需要知道。

这种 stateless 模式有一个隐形好处：**换模型厂商的成本极低**。把 `OpenAI` 换成 Anthropic / Google，`history` 这个数组的结构转换一下就能用，DB 层一行不用改。

---

## 🖥️ 三个命令的行为

### `pnpm l19`——新建对话

```text
=== Lesson 19 · DB-backed Chat ===
  DB file: /Users/.../19-db-conversations/chat.db

新建对话 9c3a1b7e-4f0c-4b1d-9a7b-3e2f1d0c5a6b
  已加载 0 条历史 items

输入消息开始聊天，输入 /exit 退出

You: 你好，我叫 David
AI : 你好 David！有什么我可以帮你的吗？
  [input_tokens: 22]

You: /exit

Bye! 对话已保存，下次继续用：pnpm l19 9c3a1b7e-4f0c-4b1d-9a7b-3e2f1d0c5a6b
```

### `pnpm l19 <conversationId>`——继续对话

```text
继续对话 9c3a1b7e-...
  已加载 2 条历史 items

--- 历史回放 ---
You: 你好，我叫 David
AI : 你好 David！有什么我可以帮你的吗？
-----------------

You: 我叫什么名字？
AI : 你叫 David。
  [input_tokens: 47]    ← 注意 token 涨了，因为历史重新喂给了模型
```

历史回放是给用户看的 UX，不影响 DB 也不影响 API 调用。

### `pnpm l19 list`——看一眼都有哪些对话

```text
已有对话列表：
  9c3a1b7e-...  | items=4  | 2026-04-22T09:12:44.000Z | (untitled)
  b8f2d0e5-...  | items=8  | 2026-04-21T14:30:10.000Z | (untitled)
```

生产版本里这里应该加分页、加筛选、加 title 自动生成（比如取第一条 user 消息的前 30 字），不过本课保持最简。

---

## 💾 持久化的关键差别

`chat.db` 是一个普通的 SQLite 文件。它的存在意味着：

- **关程序不丢**：Lesson 11 / 12 里我们用变量存 history，进程一退就没了；本课只要文件还在，历史就还在
- **跨会话可查**：任何时候用 DB Browser for SQLite 打开 `chat.db`，都能看到原始 JSON
- **可迁移**：复制文件到另一台机子，`pnpm l19` 接着跑，对话续得上
- **可备份**：一句 `cp chat.db chat.db.bak` 就是全量备份

对比前面几课的方案：

| 方案 | 重启后历史还在吗？ |
|---|---|
| Lesson 11 CLI chat（数组）| ❌ 丢 |
| Lesson 13 Express + Map | ❌ 丢（进程重启即丢） |
| Lesson 15 `previous_response_id` | ✅ 30 天内还在（OpenAI 服务端） |
| Lesson 16 Conversations API | ✅ 无 TTL（OpenAI 服务端） |
| **Lesson 19 DB-backed（本课）** | ✅ **只要文件在就在（你的磁盘）** |
| Lesson 20 `MemorySession` | ❌ 丢（内存 Map） |

---

## 🆚 对比 Lesson 16（Conversations API）

| 维度 | Lesson 16（Conversations API）| Lesson 19（本课 DB）|
|---|---|---|
| 数据存哪 | OpenAI 服务端 | 你自己的磁盘 / 数据库 |
| 数据主权 | OpenAI 的 | **完全是你的** |
| TTL | 无（但可能受 retention policy 影响）| 没有，你说了算 |
| 自定义 SQL 查询 | 不行 | ✅ `SELECT * FROM items WHERE ...` |
| 审计日志 / 合规 | 有限 | ✅ 原生支持 |
| 离线可用 | ❌ 必须联网拉历史 | ✅ 历史完全本地 |
| 绑定业务用户 / RBAC | 难（conv_id 是 OpenAI 的）| ✅ 加一列外键即可 |
| 代码量 | 极少（几行）| 中等（约 150 行本课代码）|
| 学习曲线 | 低 | 中（要懂一点 SQL）|
| 生产就绪度 | **取决于你对托管的容忍度** | ✅ 直接生产可用 |
| 换模型厂商 | 要重写（conv_id 是 OpenAI 专有）| ✅ 历史格式是你自己的 |

很粗暴的一条选型指南：

> 对话内容是否算"业务资产"——是就自建，不是就托管。

大多数严肃的 AI 产品最终都会选自建（至少会把 Conversations API 作为 "附带" 缓存而不是 "主" 存储）。

---

## 🔑 常见坑

| 症状 | 原因 | 解 |
|---|---|---|
| `better-sqlite3` 装不上（`node-gyp` / Python 报错）| `better-sqlite3` 有 native 部分，需要编译环境；Apple Silicon 偶发 rebuild 问题 | `pnpm rebuild better-sqlite3`；实在不行确认装了 Python 3 + Xcode CLT（Mac）或 `windows-build-tools`（Windows）|
| 某次启动发现 `conversation_id` 重复了 | 可能你图省事把 UUID 写死成了常量 | 一定要 `crypto.randomUUID()`，不要用 `"conv-1"` 这种假 ID |
| 历史回放顺序乱了 | `loadHistory` 里漏了 `ORDER BY position` | SELECT 时**永远**写显式的 `orderBy(asc(position))` |
| 重启后 AI 还是不记得之前说了什么 | 主循环里忘了每轮重新 `loadHistory()`，或者历史没存进去 | 确认第一步 `appendItem(user)`、第二步 `loadHistory()`、第四步 `appendItem(assistant)` 每轮都跑到 |
| `chat.db` 越来越大，磁盘被撑满 | SQLite 删了行也不会自动回收空间 | 定期 `VACUUM;` 压缩；或者把老对话归档到 `archived_conversations` 表 + 老 items 挪到冷存储 |
| 多个进程同时写，偶尔报 `database is locked` | SQLite 是文件锁，WAL 模式下读写并发还行，但高并发写还是会卡 | 升级到 Postgres；或者加一层 in-process 队列，所有写走一个 worker |
| `item_json` 里存了 `reasoning` item，下次发给模型报错 | 模型本身不接受某些 item 作为 input（比如过期的 encrypted reasoning）| 参考 Lesson 04 / 05：只持久化你**会送回给模型**的 item 类型；或者发请求前过滤一下 |
| 想对历史做全文检索（`WHERE content LIKE ...`）| `item_json` 是 blob，直接 LIKE 能凑合用但没索引 | SQLite 有 FTS5 扩展，可以对 `item_json` 建全文索引；或者加一个冗余列 `searchable_text` |

---

## 🧠 本课放在整个光谱里的位置

```
┌─────────────────────────────────────────────────────────────────┐
│                         托管侧（OpenAI 管）                      │
│                                                                 │
│  Lesson 15: previous_response_id    —— 30 天 TTL，链条只读       │
│  Lesson 16: Conversations API       —— 无 TTL，可编辑            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │   想要数据主权 / 合规 / 自定义查询 / 离线
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         自建侧（你管）                           │
│                                                                 │
│  Lesson 19: SQLite + Drizzle（本课） —— 轻量、零配置、教学首选   │
│  生产扩展:  Postgres + 同样 schema  —— 多进程、高并发           │
│           Redis 缓存 + Postgres 主存 —— 再高并发                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│   Lesson 20: Agents SDK 帮你把上面这些都**抽象成 `Session` 接口**  │
│              MemorySession / ConversationsSession / 自定义适配  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🧪 什么时候用这个方案？

### 适合用自建 DB 持久化

- **生产应用**：任何要收钱、要上线、要签合规的东西
- **审计 / 合规场景**：金融、医疗、法务，或者任何需要保留完整交互记录的
- **离线 / 边缘 app**：Electron / Tauri / 手机端 / 嵌入式设备
- **需要自定义分析**：要做 usage dashboard、要按关键词检索历史、要做 conversation 级别的 A/B 测试
- **和你现有业务数据耦合**：要把对话和你的 `users`、`projects`、`billing` 表 JOIN

### 不适合用（用更简单的方案）

- **快速原型 / 一次性 demo**：Lesson 15 的 `previous_response_id` 两行搞定，不要过度设计
- **单进程 / 单 session 的玩具脚本**：Lesson 20 的 `MemorySession` 就够了
- **只要跨"一次连接"的 session**：Lesson 13 的进程内 `Map` 也可以扛
- **团队里没人愿意维护 DB 的**：选 Conversations API 把问题甩给 OpenAI 也是合理选择

---

## 🛠️ 从本课到生产

这一课的 150 行代码已经是一个**可用的最小骨架**。真要拿去生产，下面几件事必做：

1. **换 Postgres**：把 `better-sqlite3` 换成 `pg`，schema 几乎不用改（Drizzle 同时支持两者）
2. **加 migration**：用 `drizzle-kit` 生成 migration 文件，别再 `CREATE TABLE IF NOT EXISTS` 了
3. **加索引**：`(user_id, created_at)`、`(conversation_id, position)`、按查询需求加
4. **加用户绑定**：`conversations.user_id` 外键到你的 `users` 表；所有查询都加 `WHERE user_id = ?`
5. **加 title 自动生成**：用 `client.responses.create` 让 AI 读第一条消息给对话起个标题
6. **加分页**：`listConversations` 改成 `limit/offset` 或 cursor-based
7. **加软删除**：`deleted_at INTEGER` 列，删对话只是打标，方便误删恢复
8. **加定期归档**：3 个月前的 `items` 挪到 `archived_items`，保持热表小
9. **加 token 统计列**：每轮存一下 input/output token，方便后续 usage 统计和计费

---

## ✅ 一句话带走

> **自建 SQLite + JSON blob 存原生 ResponseItem——不发明格式、不和 OpenAI 强耦合、不受 TTL 限制——这是几乎所有严肃 AI 产品在持久化上该走的第一步。**
