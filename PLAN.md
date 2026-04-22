# AI in 2026 · 手把手教学 Lab 计划

> 目标：带**零 AI 经验**的学生，用 **TypeScript + OpenAI Responses API (2026)** 从 0 到 1
> 做一个能 **生成、记忆、结构化、调工具、多轮对话** 的 AI 服务。
> 教学法：每一节都是一个独立可跑的最小文件 → 学生能亲眼看到"多了一行，AI 就多一个能力"。

---

## 0. 先把"实验室"搭好（环境 & 项目骨架）

### 0.1 技术选型（2026 年最新）
- 语言：**TypeScript** (纯 TS，不是 Python)
- 运行时：**Node.js 20+**，用 **`tsx`** 直接跑 `.ts` 文件（免编译）
- SDK：官方 `openai` v4+（调用 `openai.responses.create(...)`）
- 服务器：`express` v4
- CLI 交互：Node 内置 `readline/promises`
- 校验/Schema：`zod` + `openai/helpers/zod`（用于 Structured Outputs）
- Session：内存 `Map<sessionId, history[]>`（教学用，不用 Redis）
- 环境变量：`dotenv`

### 0.2 产出的文件结构
```
ai-in-2026/
├─ .env                       # 已存在
├─ .gitignore                 # 新建
├─ package.json               # 新建
├─ tsconfig.json              # 新建
├─ README.md                  # 整个 lab 的导览
├─ PLAN.md                    # 本文件
│
├─ 01-hello-openai/
│  └─ hello.ts                # 第 1 课：最简单的 generation
│
├─ 02-system-prompt/
│  └─ with-instructions.ts    # 第 2 课：system prompt（2026 用 "developer" / instructions）
│
├─ 03-short-term-memory/
│  └─ memory-array.ts         # 第 3 课：用 array 当短期记忆
│
├─ 04-response-anatomy/
│  └─ anatomy.ts              # 第 4 课：response 数据结构、usage、metadata
│
├─ 05-temperature-topp/
│  └─ README.md               # 第 5 课：概念课（无代码）
│
├─ 06-structured-output/
│  └─ structured.ts           # 第 6 课：zod + text.format 产品化 JSON
│
├─ 07-tool-calling/
│  └─ one-tool.ts             # 第 7 课：定义工具 + 一次工具调用
│
├─ 08-react-loop-concept/
│  ├─ react-loop.html         # 第 8 课：可视化 ReAct loop（彩色方块）
│  └─ README.md
│
├─ 09-context-window/
│  ├─ context-window.html     # 第 9 课：context window 可视化
│  └─ README.md
│
├─ 10-express-summarize/
│  └─ server.ts               # 第 10 课：Express 单轮 summarization endpoint
│
├─ 11-cli-chat/
│  └─ chat.ts                 # 第 11 课：readline 多轮对话 CLI
│
├─ 12-cli-agent/
│  └─ agent.ts                # 第 12 课：CLI + 工具调用（完整 ReAct loop）
│
└─ 13-express-stateful/
   └─ server.ts               # 第 13 课：Express + sessionId 多轮 API
```

---

## 1. 课程脉络（每节课的"从 N 到 N+1"）

| # | 主题 | 新增能力 | 关键 API / 概念 |
|---|------|---------|----------------|
| 1 | Hello OpenAI | **能发出第一个请求** | `openai.responses.create({ model, input })` · `output_text` |
| 2 | System Prompt | **控制"AI 是谁"** | `instructions` 参数 / `role: "developer"` |
| 3 | Short-Term Memory | **让 AI 记得上一句** | `input: [...history]` · role 交替 |
| 4 | Response 数据结构 | **看懂 AI 返回了什么** | `response.output[]` · `usage` · `id` · `model` · `created_at` |
| 5 | temperature & top_p | **理解"随机性"** | 纯概念，HTML/图示 |
| 6 | Structured Output | **产品化 JSON 输出** | `text.format` + `zodTextFormat(...)` · `responses.parse` |
| 7 | Tool Calling | **AI 可以调函数** | `tools: [{ type: "function", name, parameters, strict }]` · `function_call` · `function_call_output` |
| 8 | ReAct Loop 概念 | **理解 Agent 循环** | HTML 可视化：User → Assistant → Tool → Observation → Final |
| 9 | Context Window | **理解 token 预算** | HTML 可视化：不同颜色方块拼成上下文窗口 |
| 10 | Express 单轮 API | **把 AI 包成 HTTP 服务** | `POST /api/summarize` |
| 11 | CLI 多轮对话 | **写一个像 ChatGPT 的命令行** | `readline/promises` + 内存数组 |
| 12 | CLI Agent | **命令行里的 ReAct agent** | CLI + tool loop + 工具函数 |
| 13 | Express Stateful | **每个用户一个 session** | `sessionId` (cookie) + `Map<sid, history>` |
| 14 | Streaming Chat | **流式响应 + React 前端 + 流式工具调用** | SSE + `AbortController` + 流式事件解析 |
| 15 | `previous_response_id` | **服务端自动拼历史** | `store: true` + `previous_response_id` |
| 16 | Conversations API | **持久化对话对象（无 TTL）** | `client.conversations.create()` + `conversation: id` |
| 17 | Truncation | **超窗口兜底（硬截断）** | `truncation: "auto"` |
| 18 | Compaction | **上下文智能压缩** | `context_management` + `/responses/compact` |
| 19 | DB-backed Conversations | **自建持久化（SQLite + Drizzle）** | 本地 DB 存 OpenAI 原生 item JSON |
| 20 | Agents SDK Sessions | **SDK 抽象层** | `@openai/agents` MemorySession / ConversationsSession / CompactionSession |
| 21 | 策略总览 | **六种策略对比 + 选型决策树** | 概念课 |

---

## 2. 每节课详细设计

### 第 1 课 · `01-hello-openai/hello.ts`
**目标**：让学生看到"一行命令，AI 出活"。
- 最小代码：`client.responses.create({ model: "gpt-4o-mini", input: "Say hello in 1 sentence." })`
- 打印 `response.output_text`
- 教学点：SDK 从 `process.env.OPENAI_API_KEY` 自动读取；Responses API 是 2026 的默认

### 第 2 课 · `02-system-prompt/with-instructions.ts`
**目标**：学会"驯服"AI 的人设 / 风格 / 输出规则。
- 演示两种等价写法：
  - A. `instructions: "You are a terse senior engineer..."`
  - B. `input: [{ role: "developer", content: "..." }, { role: "user", content: "..." }]`
- 用 COSTAR 模板写 `instructions`（Context/Objective/Style/Tone/Audience/Response）
- 教学点：2026 用 **`developer`** 角色（不是 `system`），优先级最高

### 第 3 课 · `03-short-term-memory/memory-array.ts`
**目标**：让学生亲眼看到"加一条 history，AI 就记住了"。
- 敲一遍经典的 "knock knock" 对话：
  ```ts
  input: [
    { role: "user", content: "knock knock" },
    { role: "assistant", content: "Who's there?" },
    { role: "user", content: "Orange" },
  ]
  ```
- 教学点：**无状态请求 + 手动传历史 = 短期记忆**；这是第 11/13 课的基础

### 第 4 课 · `04-response-anatomy/anatomy.ts`
**目标**：把 `response` 对象拆开讲清楚。
- `console.log(JSON.stringify(response, null, 2))`
- 注释每个字段：
  - `id` / `model` / `created_at` / `status`
  - `output[]`：不一定是单条，可能含 `message` / `function_call` / `reasoning`
  - `output_text`（SDK 便捷字段）
  - `usage.input_tokens` / `output_tokens` / `total_tokens`
- 教学点：**不要假设 `output[0].content[0].text` 永远存在** — 用 `output_text` 或遍历

### 第 5 课 · `05-temperature-topp/README.md`
**目标**：概念课，无代码。
- 用比喻解释：
  - `temperature`：掷骰子前先"加/减温度"——低温度=最可能的词，高温度=更发散
  - `top_p`（nucleus sampling）：只从累计概率 top-p 的候选里抽
- 给一个推荐表：
  - 产品输出：`temperature: 0.2 ~ 0.4`
  - 创意写作：`temperature: 0.8 ~ 1.0`
  - **一般二选一，别同时调**
- 可以放一张"概率分布"ASCII 图

### 第 6 课 · `06-structured-output/structured.ts`
**目标**：AI 不再返回"一段话"，而是**直接落库的 JSON**。
- 用 `zod` 定义 Schema：
  ```ts
  const CourseCard = z.object({
    title: z.string(),
    difficulty: z.enum(["beginner", "intermediate", "advanced"]),
    keyPoints: z.array(z.string()),
    pitfalls: z.array(z.string()),
  });
  ```
- 调 `client.responses.parse({ model, input, text: { format: zodTextFormat(CourseCard, "course_card") } })`
- 拿到 `response.output_parsed`，类型 100% 安全
- 教学点：`strict: true` 意味着**保证 schema 合法**（不会缺字段、不会多字段）

### 第 7 课 · `07-tool-calling/one-tool.ts`
**目标**：让 AI 学会"我不知道，我去调个函数"。
- 定义一个假工具：`get_weather(city: string)`
  ```ts
  tools: [{
    type: "function",
    name: "get_weather",
    description: "Get current weather for a city",
    parameters: { type: "object", properties: { city: { type: "string" }}, required: ["city"], additionalProperties: false },
    strict: true,
  }]
  ```
- 两步走（**本课只展示一轮**，第 12 课做完整 loop）：
  1. 第一次请求 → 收到 `output: [{ type: "function_call", call_id, name, arguments }]`
  2. 手动执行本地 `get_weather`，组装 `{ type: "function_call_output", call_id, output: "..." }` 回传
  3. 拿到最终文本回答
- 教学点：**工具调用 = 特殊格式的 output item**；`call_id` 是回传的"收据号"

### 第 8 课 · `08-react-loop-concept/react-loop.html`
**目标**：可视化 ReAct loop（**纯前端静态 HTML**，不跑 AI）。
- 页面布局：一条垂直时间线，每个"事件"是一个彩色圆角矩形
  - 🟦 蓝色 = `user` message
  - 🟪 紫色 = `developer / instructions`
  - 🟩 绿色 = `assistant` 文本
  - 🟧 橙色 = `function_call`
  - 🟨 黄色 = `function_call_output` (observation)
  - 🟥 红色 = `final answer`
- 模拟一个完整周期（用户问天气 → AI 调工具 → 工具返回 → AI 总结）
- 顶部配一段文字解释：Reason → Act → Observe → Repeat

### 第 9 课 · `09-context-window/context-window.html`
**目标**：让学生**直观看到** context window 是怎么被"吃掉"的。
- 一个大矩形表示总窗口（比如 128k tokens）
- 内部用不同颜色的小方块按顺序堆满：
  - 灰色 = system/developer instructions
  - 蓝色 = user turns
  - 绿色 = assistant turns
  - 橙色 = tool calls
  - 黄色 = tool outputs
- 每个小方块显示大概的 token 占用
- 右侧显示"剩余空间"会随轮次减少
- 教学点：轮次越多 → 剩余越少 → 要么截断、要么 summarize

### 第 10 课 · `10-express-summarize/server.ts`
**目标**：把前几课的能力**包成一个真 HTTP API**。
- `POST /api/summarize`，body: `{ text: string }`
- 最少 20 字、最多 10k 字的校验
- 错误统一格式 `{ success, data?, error? }`
- `services/ai.service.ts` 封装 `summarize(text)` → 调 Responses API
- 教学点：**controller 做 HTTP 事，service 做 AI 事**

### 第 11 课 · `11-cli-chat/chat.ts`
**目标**：一个能**连续聊天**的命令行程序。
- `readline/promises` 逐行读取用户输入
- 内存里维护 `history: InputItem[]`
- 每轮：append user → call API → append assistant → 打印
- 支持 `/exit`、`/reset`、`/tokens`（打印 usage）命令
- 教学点：把第 3 课 + 第 4 课拼起来就是一个 mini ChatGPT

### 第 12 课 · `12-cli-agent/agent.ts`
**目标**：在 CLI 里跑一个**真正的 ReAct agent**（带工具调用循环）。
- 定义 2~3 个玩具工具：`get_time()`、`add(a, b)`、`search_notes(query)`（后者查一个本地 JSON 文件）
- 关键循环：
  ```
  while (true) {
    resp = responses.create({ input: history, tools })
    for item in resp.output:
      if item.type == "function_call":
        result = localRun(item.name, item.arguments)
        history.push(item)           // 保留 function_call
        history.push({ type: "function_call_output", call_id, output })
      else if item.type == "message":
        print(item)
        break                         // 没新工具调用，退出 loop
  }
  ```
- 教学点：**Agent = 循环 + 工具**；第 8 课的可视化此刻完全对上号

### 第 13 课 · `13-express-stateful/server.ts`
**目标**：多用户、多会话的真 Web API。
- **2026 推荐做法**：
  - HTTP-only `session_id` **cookie**（`SameSite=Lax`，`Secure` in prod）
  - 服务端用 `Map<sessionId, Message[]>` 存 history（教学用内存）
  - 首次请求没 cookie → 生成 UUID → `Set-Cookie`
  - 后续请求读 cookie → 找到对应 history → 继续对话
- 路由：
  - `POST /api/chat` body: `{ message }` → 返回 `{ reply, usage }`
  - `POST /api/chat/reset` → 清掉该 session 的 history
- **对比教学**：
  - 方案 A（本课用的）：**客户端只存 sessionId，服务端存历史** → 简单、隐私好
  - 方案 B：客户端存全部历史 → 服务端无状态（类似 JWT 思路）
  - 方案 C：用 Responses API 的 `previous_response_id` 或 Conversations API 做**服务端托管** → 2026 的"零运维"选项（简单提一下，不做）

---

### 第 14 课 · `14-streaming-chat/`（前端 UI + 后端 SSE + 流式 Tool Calling）
**目标**：让 AI 回复像 ChatGPT 一样"边生成边显示"。课程从此从 CLI/curl 走到真浏览器。

- **技术选型**：
  - 前端：**React 19** + **Vite 6** + **TypeScript**（独立 `web/package.json`）
  - 后端：继续 **Express v5** + **openai SDK**（Responses API 的 `stream: true` 模式）
  - 传输：**SSE**（Server-Sent Events），不用 WebSocket
- **核心概念**：
  - **TTFT**（Time to First Token）—— 用户感知延迟的唯一关键指标
  - Responses API 流式事件：`response.output_text.delta` / `response.output_item.added` / `response.function_call_arguments.delta` / `response.output_item.done` / `response.completed`
  - 前端拼帧三件套：`fetch` + `ReadableStream.getReader()` + `TextDecoder({ stream: true })` + `buf.split("\n\n")`
  - 流式 Tool Calling：参数 JSON 字符一个一个流入 → 拼完 → 本地执行 → 推回 history → agent loop 下一轮
  - `AbortController` 双向：前端停止按钮 → 切断 fetch；后端 `res.on("close")` → 切断上游 OpenAI 请求
- **产出**：
  - `server/` — `server.ts` + `session.ts` + `tools.ts`
  - `web/` — Vite + React，独立 TS 工程；vite.config.ts 配 `/api` → `:3000` 代理
  - `docs/` — 4 份 HTML 课件：TTFT / 事件流 / SSE 线格式 / AI SDK v6 对比
- **七步 checkpoint**（README 里详述）：
  1. 概念（读 HTML 课件）
  2. 最小 SSE 后端（纯文本）
  3. 接入 session + history
  4. 最小 React 前端（字符能流出来）
  5. 聊天 UI 打磨（气泡 / typing / 自动滚动 / Enter 发送）
  6. 流式 Tool Calling（本课难点）
  7. Abort + retry + AI SDK 对比课件

---

## 3. 执行顺序（先骨架，再按课推进）

1. **Step 0**：建 `package.json` / `tsconfig.json` / `.gitignore` / `README.md`（根目录导览）
2. **Step 1–4**：写 4 个最小 `.ts` 文件（1~50 行/个），让学生能 `npx tsx 01-hello-openai/hello.ts` 逐个跑
3. **Step 5**：写概念 README（temperature/top_p）
4. **Step 6–7**：Structured Output + Tool Calling
5. **Step 8–9**：两个静态 HTML 可视化
6. **Step 10**：Express 单轮 endpoint
7. **Step 11–12**：两个 CLI 程序
8. **Step 13**：Express stateful + cookie

---

## 4. 需要你确认的 4 个点

1. **模型**：我准备默认用 `gpt-4o-mini`（便宜、够用、Responses 支持齐全）。要换成 `gpt-4.1-mini` 或 `gpt-5` 吗？
2. **包管理器**：`npm` 还是 `pnpm`？
3. **ExpressJS 版本**：默认 v4（生态最稳）；要不要上 v5？
4. **Session cookie 方案**（第 13 课）：我倾向"服务端内存 Map + HTTP-only cookie"。OK 吗？

确认后我会按 Step 0 → Step 13 顺序一步步生成文件，每生成一个就告诉你如何运行、你可以逐课验证。
