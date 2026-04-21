# Lesson 14 · Streaming Chat（前端 UI + 后端 SSE + 流式 Tool Calling）

让 AI 的回复像 ChatGPT 那样"边生成边显示"。
这是把 Lesson 13 的后端 + Lesson 12 的 agent loop **拼起来 + 流式化 + 加前端 UI**。

---

## 🎯 本课学完后你会

- 理解 **TTFT（Time to First Token）** 为什么是 AI 产品体验的核心指标
- 会用 **OpenAI Responses API 的 stream 模式**（`stream: true` + 异步事件流）
- 会在 Express 里写标准 **SSE（Server-Sent Events）** 响应
- 会在前端用 **`fetch` + `ReadableStream` + `TextDecoder`** 拼帧渲染
- 会实现**流式 tool calling**：参数 token-by-token 填充 + 执行 + 继续下一轮
- 了解 **Vercel AI SDK v6** 帮你做了什么（对比课件）

---

## 📦 目录结构

```
14-streaming-chat/
├── server/
│   ├── server.ts          # 主入口 + SSE endpoint + 流式 agent loop
│   ├── session.ts         # session middleware（沿用 Lesson 13）
│   └── tools.ts           # 工具定义 + runTool（沿用 Lesson 12）
├── web/                   # Vite + React 19 + TypeScript
│   ├── src/
│   │   ├── App.tsx
│   │   ├── useStreamingChat.ts   # ★ 核心 hook
│   │   ├── components/
│   │   │   ├── MessageList.tsx
│   │   │   ├── Bubble.tsx
│   │   │   ├── ToolBubble.tsx
│   │   │   └── Composer.tsx
│   │   └── styles.css
│   └── vite.config.ts     # /api → http://localhost:3000 代理
└── docs/                  # 4 份 HTML 课件（在浏览器里打开）
    ├── 01-why-streaming-ttft.html
    ├── 02-responses-stream-events.html
    ├── 03-sse-wire-and-concat.html
    └── 04-ai-sdk-comparison.html
```

---

## 🚀 运行

打开**两个终端**：

```bash
# 终端 1：启动后端（端口 3000）
pnpm l14:server

# 终端 2：启动前端 Vite dev（端口 5173）
pnpm l14:web
```

浏览器打开 <http://localhost:5173> 开聊。

```bash
# 也可以用 curl 裸测 SSE 流
curl -sN -c jar.txt -X POST http://localhost:3000/api/chat/stream \
  -H 'Content-Type: application/json' \
  -d '{"message":"Tokyo 天气如何？"}'
```

---

## 🪜 七步走（每步对应一小块代码，都能跑）

### Step 0 · 概念打地基（先读不写）

先在浏览器依次打开：
1. `docs/01-why-streaming-ttft.html` — 为什么要流式？TTFT 是什么？
2. `docs/02-responses-stream-events.html` — Responses API 的 6 个关键事件
3. `docs/03-sse-wire-and-concat.html` — SSE 原始报文 + 前端拼帧管道

> 💡 这一步只花 10-15 分钟，但后面 Step 1-6 全靠这些概念。

---

### Step 1 · 最小 SSE 后端（纯文本流）

**目标**：一个 `POST /api/chat/stream` 能把 OpenAI 的文字 token 一个一个吐给 curl。

最小代码（`server.ts` 的核心）：

```ts
app.post("/api/chat/stream", async (req, res) => {
  const { message } = req.body;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();                              // ★ 不 flush 就没 TTFT

  const stream = await client.responses.create({
    model: "gpt-5.4-nano",
    input: message,
    stream: true,                                  // ★ 本课核心
  });

  for await (const ev of stream) {
    if (ev.type === "response.output_text.delta") {
      res.write(`event: delta\ndata: ${JSON.stringify({ text: ev.delta })}\n\n`);
    }
  }
  res.write(`event: done\ndata: {}\n\n`);
  res.end();
});
```

**验收**：

```bash
curl -sN -X POST http://localhost:3000/api/chat/stream \
  -H 'Content-Type: application/json' \
  -d '{"message":"用一句话介绍 TTFT"}'
```

应该看到 `event: delta` 一行一行打出来。

---

### Step 2 · 接入 session + history

**目标**：复用 Lesson 13 的 cookie session，让对话跨请求记忆。

加进去的事：
- `cookieParser()` 中间件
- 一个 `sessionMiddleware`：无 cookie 就生成 UUID；`Map<sessionId, state>` 存历史
- 流开始前：`state.chatHistory.push({ role: "user", content: message })`
- 流结束后：`state.chatHistory.push({ role: "assistant", content: fullText })`
- Responses API 的 `input` 换成 `state.chatHistory`（整个数组都要传）

**验收**（注意 `-c` / `-b` 带 cookie）：

```bash
curl -sN -c jar.txt -X POST http://localhost:3000/api/chat/stream \
  -d '{"message":"我叫李天一"}' -H 'Content-Type: application/json'

# 同一个 cookie 下再问一次
curl -sN -b jar.txt -X POST http://localhost:3000/api/chat/stream \
  -d '{"message":"我叫什么？"}' -H 'Content-Type: application/json'
# → 应该答出"李天一"
```

---

### Step 3 · 最小 Vite + React 前端

**目标**：浏览器里看到字符一个一个蹦出来。

产出：
- `web/package.json` — React 19 + Vite 6 + TS
- `web/vite.config.ts` — `/api → http://localhost:3000` 代理
- `web/src/App.tsx` — 一个 textarea + 一个 div

前端核心三件套（拼帧）：

```ts
const resp = await fetch("/api/chat/stream", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",                      // 带 cookie
  body: JSON.stringify({ message: text }),
});

const reader = resp.body!.getReader();
const decoder = new TextDecoder("utf-8");
let buf = "";

while (true) {
  const { value, done } = await reader.read();
  if (done) break;

  buf += decoder.decode(value, { stream: true });   // ★ stream:true
  const frames = buf.split("\n\n");                 // ★ \n\n 是帧边界
  buf = frames.pop()!;                              // ★ 最后一段可能半截

  for (const frame of frames) {
    // 解析 "event: xxx\ndata: {...}" 然后 setState
  }
}
```

**验收**：启动前后端后 `open http://localhost:5173`，输入问题回车，字符逐个出现。

---

### Step 4 · 聊天 UI 打磨

拆成组件，引入状态机。

- **消息数据结构**：`{ id, role, content, status: "streaming"|"done"|"error"|"aborted", toolCalls: [] }`
- **`<MessageList />`**：渲染数组 + 智能自动滚动（只在用户"在底部附近"时才跟随）
- **`<Bubble />`**：根据 role 左右对齐，streaming 时显示光标 `▋`，空状态显示 `● ● ●` 动画
- **`<Composer />`**：Enter 发送 / Shift+Enter 换行 / streaming 时禁用输入
- **UX 关键**：发送瞬间就 push 一条空 assistant 消息（status: "streaming"），让用户**立刻看到**系统在工作

---

### Step 5 · 流式 Tool Calling ⭐

**目标**：问"Tokyo 天气"时，用户看到：
1. ⚙️ 一个 `get_weather` 气泡出现（参数为空）
2. 参数 JSON 字符一个一个填入：`{"` → `city` → `":"` → `Tokyo` → `"}`
3. ✅ 图标变绿，结果 JSON 出现
4. 再流出最终文字答复

**后端要多监听的 3 个事件**：

```ts
for await (const ev of stream) {
  switch (ev.type) {
    // 已有
    case "response.output_text.delta":
      write("delta", { text: ev.delta });
      break;

    // 新增：tool call 开始
    case "response.output_item.added":
      if (ev.item.type === "function_call") {
        write("tool_start", { id: ev.item.id, name: ev.item.name });
      }
      break;

    // 新增：tool 参数 token by token
    case "response.function_call_arguments.delta":
      write("tool_args_delta", { id: ev.item_id, delta: ev.delta });
      break;

    // 新增：tool 参数完成 → 本地执行 → 推回 history
    case "response.output_item.done":
      if (ev.item.type === "function_call") {
        const result = await runTool(ev.item.name, JSON.parse(ev.item.arguments));
        state.chatHistory.push(ev.item);
        state.chatHistory.push({
          type: "function_call_output",
          call_id: ev.item.call_id,
          output: JSON.stringify(result),
        });
        write("tool_result", { id: ev.item.id, result });
      }
      break;
  }
}
```

**关键结构**：这一切外面是 `while (true) { ... }` —— 如果本轮有 tool call，流结束后 **回到循环顶部再发一次** `responses.create`，让 AI 看到 tool 结果后生成最终文本。没有 tool call 时才 break。

**前端要多处理的 3 个事件**：`tool_start` / `tool_args_delta` / `tool_result`，各自在消息的 `toolCalls` 数组里 push / append / 标记完成。

**验收**：浏览器里问 "Tokyo 天气如何？"，看到工具气泡的 3 个 phase 动画。

---

### Step 6 · AbortController + retry + AI SDK 对比

**前端 abort**（用户点"停止"）：

```ts
const abortRef = useRef<AbortController | null>(null);

// 发送时
const ac = new AbortController();
abortRef.current = ac;
fetch("/api/chat/stream", { ..., signal: ac.signal });

// 停止按钮
<button onClick={() => abortRef.current?.abort()}>停止</button>
```

**后端响应客户端断开**（不白烧 token）：

```ts
// ⚠️ 用 res.on("close") 不是 req.on("close")
// req 的 close 在请求体读完后就会触发，不是客户端断开！
const ac = new AbortController();
res.on("close", () => {
  if (!res.writableEnded) ac.abort();
});

const stream = await client.responses.create(
  { /* ... */ stream: true },
  { signal: ac.signal }
);
```

**Retry**：失败/中止后保留最后一条用户消息，前端按钮把那条再发一次。

**最后一份课件**：`docs/04-ai-sdk-comparison.html` —— 把本课手写的所有东西，和 Vercel AI SDK v6 的 `useChat` + `streamText` 并排对比。一眼看出"抽象帮你省了多少代码，同时你失去了多少黑盒理解"。

---

## 🔑 常见坑（一个一个排）

| 症状 | 原因 | 解 |
|---|---|---|
| 前端看不到任何字节，要等很久才一次性出现 | 后端没 `res.flushHeaders()`，全被缓冲了 | 加 `res.flushHeaders()` + 每次 `res.write` |
| 中文流出来有 `�` 乱码 | `TextDecoder` 没带 `{ stream: true }` | `decoder.decode(value, { stream: true })` |
| 某些 chunk 解析报错 | 按 chunk 解析而不是按帧 | 必须 `buf.split("\n\n")` 后留尾 |
| 刚开始就报 `Request was aborted` | 用了 `req.on("close")`，在请求体读完后立即触发 | 换成 `res.on("close")` + 检查 `writableEnded` |
| 前端发不出请求、CORS 报错 | 后端没开 CORS（或 Vite 没配 proxy） | 后端 `cors({ credentials: true })` + Vite proxy |
| 问天气 AI 不调工具，直接乱编 | `developer` 指令没明确要求用 tool | 在 `DEVELOPER_INSTRUCTIONS` 里写清"weather 必须用 get_weather" |
| 刷新页面后聊天没了 | 前端只存在内存，服务端 `Map` 仍有 | 本课刻意不做持久化；下一课讲 |

---

## 🧠 本课的 4 个抽象层

从底到高：

```
┌──────────────────────────────────────────────┐
│ ④ UI：消息列表 / 气泡 / typing / 自动滚动      │  ← <MessageList /> <Bubble />
├──────────────────────────────────────────────┤
│ ③ 业务状态：Msg[] + toolCalls + status        │  ← useStreamingChat
├──────────────────────────────────────────────┤
│ ② 传输层：SSE 帧切分 + 事件分发                │  ← parseFrame / dispatch
├──────────────────────────────────────────────┤
│ ① 字节流：fetch → ReadableStream → TextDecoder │  ← 浏览器 API
└──────────────────────────────────────────────┘
```

每一层你都手写了一遍。以后遇到类似需求（WebSocket 聊天 / gRPC streaming / tRPC subscriptions），同样的分层思路都能迁移。
