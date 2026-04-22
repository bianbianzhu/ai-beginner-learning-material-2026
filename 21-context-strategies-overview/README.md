# Lesson 21 · 上下文与记忆策略总览

> 一句话总结：**六种上下文策略不是互斥的，是按场景叠加的武器库。**

Lessons 15–20 分别单独讲了六种管理对话上下文的方法。本课是**总结对比**：一张图看清它们的差异、配合、和选型。

本课**没有代码文件**——它是前六课的收束。

---

## 🎯 本课学完后你会

- 把六种策略放到一张对比表里，清楚它们的**关键差异**
- 按场景做出选型：prototype / 生产 chatbot / 长跑 agent / 合规场景各该用什么
- 理解**哪些策略可以组合使用**（例如 DB + compaction）
- 知道**哪些 OpenAI 不内置、需要自己做**的事情（脱敏、用户偏好、跨对话长期记忆）

---

## 📖 策略一览

| # | 课 | 策略 | 一句话定义 | 底层机制 |
|---|---|---|---|---|
| 15 | `previous_response_id` | 服务端响应链 | OpenAI 按 response ID 自动拼接历史 | `store: true` + 服务端存储 30 天 |
| 16 | Conversations API | 持久化会话对象 | `conv_xxx` 对象，无 TTL | `client.conversations.create()` + `conversation: id` |
| 17 | Truncation | 硬截断安全网 | 超窗口自动丢弃 items | `truncation: "auto"` |
| 18 | Compaction | 智能压缩 | 把历史压成一个加密 item | `context_management` 或 `/responses/compact` |
| 19 | DB-backed | 自建持久化 | 自己存 SQLite / Postgres | 应用层代码 |
| 20 | Agents SDK Sessions | SDK 抽象 | 上面几种策略的高级封装 | `MemorySession` / `OpenAIConversationsSession` / `OpenAIResponsesCompactionSession` |

---

## 🧭 对比表

### 维度 1：存储与持久化

| 策略 | 数据在哪 | TTL | 跨进程/设备 | 可删除 |
|---|---|---|---|---|
| L15 previous_response_id | OpenAI 服务端 | **30 天** | ✅（知道 ID 即可） | 被动：到期自动过期 |
| L16 Conversations API | OpenAI 服务端 | **无 TTL** | ✅ | ✅ `conversations.delete()` |
| L17 Truncation | 不存储（只是请求参数） | N/A | N/A | N/A |
| L18 Compaction | 取决于 `store`；可 ZDR | 取决于 `store` | 取决于 `store` | 取决于 `store` |
| L19 DB-backed | **你自己的 DB** | 你决定 | 取决于 DB 访问 | ✅ 你完全控制 |
| L20.A MemorySession | 进程内存 | 进程生命期 | ❌ | ✅ `clearSession()` |
| L20.B ConversationsSession | OpenAI 服务端（L16） | 无 TTL | ✅ | ✅ `clearSession()` |
| L20.C CompactionSession | 取决于 underlyingSession | 同上 | 同上 | 同上 |

### 维度 2：计费与成本

| 策略 | 历史 token 是否计费 | 额外成本 |
|---|---|---|
| L15 previous_response_id | **全部计费**（每轮全量 re-bill） | 无 |
| L16 Conversations API | **全部计费** | 无（存储免费） |
| L17 Truncation | 被丢弃的部分不计费 | 无 |
| L18 Compaction | 压缩后显著减少 | 压缩调用本身消耗 tokens（一次性） |
| L19 DB-backed | **全部计费**（和 L3/L15 一样） | 你的数据库基础设施成本 |
| L20 所有 Session | 底层继承所选策略 | 无额外 |

> 核心认知：**服务端存储不等于免费** —— 除了 truncation 丢弃的部分和 compaction 压缩掉的部分，其余所有历史 tokens 每轮都按 input 计费。

### 维度 3：代码复杂度

| 策略 | 核心代码量 | 自己维护 history？ | 自己维护 DB？ |
|---|---|---|---|
| L15 previous_response_id | **~3 行** | ❌ | ❌ |
| L16 Conversations API | ~5 行 | ❌ | ❌ |
| L17 Truncation | +1 个参数 | 取决于其他策略 | 取决于其他策略 |
| L18 Manual Compaction | ~10 行（压缩 + 拼接） | ✅ 需要把 output 拼进下一轮 | ❌ |
| L18 Auto Compaction | +1 个参数 | 取决于其他策略 | ❌ |
| L19 DB-backed | **~100+ 行**（schema + CRUD） | ✅ | ✅ |
| L20 MemorySession | ~3 行 | ❌（SDK 管） | ❌ |
| L20 ConversationsSession | ~3 行 | ❌（SDK 管） | ❌ |
| L20 CompactionSession | ~5 行 | ❌（SDK 管） | ❌ |

### 维度 4：上下文保留质量

| 策略 | 会丢失信息吗 | 语义保留 | 可人工检视 |
|---|---|---|---|
| L15 previous_response_id | 不丢 | 原样 | ✅（response logs） |
| L16 Conversations API | 不丢 | 原样 | ✅（items.list） |
| L17 Truncation | **会丢**（硬丢） | ❌ | ❌（丢的内容无法恢复） |
| L18 Compaction | 会丢一部分（智能压缩） | ✅（模型可理解） | **❌** 加密 opaque item，人读不懂 |
| L19 DB-backed | 不丢（除非你主动清理） | 原样 | ✅ SQL 查询 |
| L20 MemorySession | 进程退出就丢 | N/A | ✅（getItems） |
| L20 其他 Session | 继承底层 | 继承底层 | 继承底层 |

---

## 🌳 决策树：我该用哪个？

```
开始
 │
 ├─ 是一次性脚本/demo？
 │    └─ ✅ previous_response_id (L15) 或 MemorySession (L20.A)
 │
 ├─ 用户能跨设备/跨会话继续对话？
 │    ├─ 用 OpenAI 的服务端存储？
 │    │    └─ ✅ Conversations API (L16) 或 OpenAIConversationsSession (L20.B)
 │    └─ 必须存在自己的 DB？（合规 / 审计 / 自定义查询）
 │         └─ ✅ DB-backed (L19)
 │
 ├─ 对话会跑很久、容易超上下文窗口？
 │    ├─ 想保留语义 → ✅ Compaction (L18) 或 CompactionSession (L20.C)
 │    └─ 不在乎丢内容、只要不报错 → ✅ Truncation (L17)
 │
 ├─ 想要 agent、工具调用、handoff 这些高级功能？
 │    └─ ✅ Agents SDK (L20) —— 建议从 ConversationsSession 或 CompactionSession 起步
 │
 └─ 不确定？
      └─ 从 previous_response_id (L15) 起步，后续需要再升级
```

---

## 🎛️ 典型组合方案

实际生产很少只用一种，下面是常见叠加：

### 方案 A：零配置 prototype
- L15 `previous_response_id` + L17 `truncation: "auto"`
- 好处：最少代码，不用怕超限
- 限制：30 天 TTL、不能跨设备

### 方案 B：产品化 chatbot（推荐起点）
- L16 Conversations API + L17 `truncation: "auto"` + L18 auto compaction
- 好处：永久持久化 + 兜底 + 长对话友好
- 限制：数据在 OpenAI 服务端

### 方案 C：合规 / 自主可控
- L19 DB-backed + L17 `truncation: "auto"` +（可选）自建 summarization
- 好处：完全自主可控、支持离线分析
- 限制：代码量多

### 方案 D：长跑 agent（写代码 / 研究）
- L20.C `OpenAIResponsesCompactionSession`（underlying = MemorySession 或自建 DB-backed Session）
- 好处：自动压缩、SDK 管住了 context 生命周期
- 限制：引入了 Agents SDK 依赖

---

## 🧱 OpenAI 仍然不内置的（自己做）

即使用了以上 6 种策略，下面这些事情**仍然需要你自己处理**：

| 需求 | 为什么 OpenAI 不内置 | 自己怎么做 |
|---|---|---|
| **长期用户记忆** | 跨对话的"Alice 偏好简洁"属于产品层面 | 存在自己的 `user_profile` 表里，每次把相关字段拼进 instructions |
| **隐私脱敏** | OpenAI 不可能知道哪些字段是敏感字段 | 在 append 历史前，正则/NER 做 masking |
| **自定义摘要（人类可读）** | Compaction 是加密的，opaque | 自己调用一次 LLM 做摘要，存在你的 DB |
| **RBAC / 多租户** | 属于应用层 | `user_id` 关联 conversation / 自己的 DB |
| **"忘记我"** | 对于 L15/L16 能做，但用户触达要自己建 | 自己写 UI + 调用 `conversations.delete` 或 DB delete |

---

## 🎯 和早期课程的关系

| 旧课 | 新课替代 / 增强 |
|---|---|
| L03 手动 history 数组 | L15（服务端拼接）或 L20.A（SDK 抽象） |
| L11 CLI chat（内存数组） | L15 / L20.A |
| L13 Express + sessionId + Map | L16 + cookie / L19 DB + cookie |
| L14 Streaming chat（自己维护 session） | 可改用 L16 或 L20.B 替代内部的 Map |

**L03–L14 教的是原理，L15–L20 教的是生产级方案。** 两者都有价值——懂原理的人才能在 OpenAI 的抽象漏水时兜底。

---

## 🔑 常见选型误区

| 误区 | 真相 |
|---|---|
| "用了 previous_response_id，token 就免费了" | ❌ 所有历史 token 仍然按 input 计费 |
| "Conversations API 能无限存下去，不要钱" | 存储免费，但每轮全量历史 tokens 仍计费 |
| "Compaction 能让 AI 记得一切" | Compaction 是信息丢失压缩，**一定有损** |
| "Truncation 比 Compaction 简单所以更好" | Truncation 会硬丢语义，长对话体验差 |
| "用了 Agents SDK，就不用理解底层了" | SDK 是便利，不是魔法——遇到问题还是要回到 Responses API 层 |
| "一个项目只能选一种策略" | 完全可以叠加：DB 存审计 + compaction 管 token + truncation 兜底 |

---

## 📚 每课的入口

| 课 | 代码文件 | 运行命令 |
|---|---|---|
| [L15](../15-previous-response-id/) | `chain.ts` / `demo.ts` | `pnpm l15` / `pnpm l15:demo` |
| [L16](../16-conversations-api/) | `durable-chat.ts` | `pnpm l16` |
| [L17](../17-truncation/) | `truncation.ts` | `pnpm l17` |
| [L18](../18-compaction/) | `manual-compact.ts` / `auto-compact.ts` | `pnpm l18:manual` / `pnpm l18:auto` |
| [L19](../19-db-conversations/) | `db-chat.ts` | `pnpm l19` |
| [L20](../20-agents-sdk-sessions/) | `memory-session.ts` / `conversations-session.ts` / `compaction-session.ts` | `pnpm l20:memory` / `pnpm l20:conv` / `pnpm l20:compact` |

---

## ✅ 记住一句话

> **上下文管理不是一个选择题，是一个组合题。**
>
> 先选持久化层（L15/16/19），再叠兜底（L17），再叠压缩（L18），最上层可选 SDK 便利（L20）。
> 不确定就从 L15 开始，能跑通再逐层加功能。
