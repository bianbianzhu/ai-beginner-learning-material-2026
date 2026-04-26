/**
 * Lesson 14 · 流式聊天后端（Streaming Chat Server）
 * ==========================================================
 * 本文件用注释分成 6 个"段落"，对应 README 的 Step 1 → Step 6。
 * 按照 Step 顺序从上到下阅读就能重建课堂过程。
 *
 * 启动：pnpm l14:server
 *
 * ─────────────────────────────────────────────────────────
 *   端点:
 *     POST /api/chat/stream   SSE 流：event: delta | tool_start | tool_args_delta | tool_result | done | error
 *     POST /api/chat/reset    清空当前 session
 *     GET  /healthz
 * ─────────────────────────────────────────────────────────
 */

import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import OpenAI from "openai";
import type { ResponseInputItem } from "openai/resources/responses/responses.mjs";

import {
  sessionMiddleware,
  resetSession,
  newSession,
  getState,
  getSessionId,
} from "./session.js";
import { tools, runTool } from "./tools.js";

const client = new OpenAI();
const MODEL = "gpt-5.4-nano";

// ============================================================
// App setup
// ============================================================
const app = express();

// Step 3 加入：前端 Vite 跑在 5173，后端在 3000，需要 CORS + 允许带 cookie
app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(sessionMiddleware);

// ============================================================
// 健康检查
// ============================================================
app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

// ============================================================
// SSE 工具：把"写一帧"统一封装
// ------------------------------------------------------------
// 每一帧 = `event: <name>\ndata: <json>\n\n`
// 空行（\n\n）是唯一的帧分隔符。见 docs/03-sse-wire-and-concat.html
// ============================================================
type SSEWriter = (event: string, data: unknown) => void;

function makeSSEWriter(res: express.Response): SSEWriter {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // 让 nginx / 反向代理也别缓冲
  res.flushHeaders();

  return (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
}

// ============================================================
// POST /api/chat/reset    (Step 2)
// ============================================================
app.post("/api/chat/reset", (req, res) => {
  resetSession(getSessionId(req));
  res.json({ ok: true });
});

// ============================================================
// POST /api/chat/stream   ←← 本课的核心端点
// ------------------------------------------------------------
//  Step 1  : 纯文本流（无 session/无 tool）
//  Step 2  : 接入 session + chatHistory
//  Step 5  : 扩展成"流式 agent loop"（可多轮 tool call）
//  Step 6  : AbortController（req.on("close") 切断上游）
// ============================================================
app.post("/api/chat/stream", async (req, res) => {
  const { message } = req.body ?? {};
  if (typeof message !== "string" || message.trim().length === 0) {
    res.status(400).json({ ok: false, error: "field `message` is required" });
    return;
  }
  if (message.length > 4000) {
    res
      .status(400)
      .json({ ok: false, error: "message too long (max 4000 chars)" });
    return;
  }

  const state = getState(req);
  state.chatHistory.push({ role: "user", content: message });

  const write = makeSSEWriter(res);

  // --- Step 6: Abort 上游 ------------------------------------
  // 如果客户端提前断开（tab 关、按了"停止"），OpenAI 请求也该取消，
  // 不然你会一直烧 token。
  // 注意：要监听 res.on("close") 而不是 req.on("close")。
  // req 的 close 在请求体读完后就会触发，跟"客户端断连"不是一回事。
  let currentAbort = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) currentAbort.abort();
  });

  try {
    await runStreamingAgentLoop({
      state,
      write,
      getAbortSignal: () => currentAbort.signal,
      resetAbort: () => {
        currentAbort = new AbortController();
      },
    });
    write("done", { turnCount: ++state.metadata.turnCount });
  } catch (err) {
    if (isAbortError(err)) {
      // 客户端主动断开，不是异常；静默结束
      return;
    }
    console.error("[stream error]", err);
    write("error", { message: (err as Error).message || "stream failed" });
  } finally {
    res.end();
  }
});

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; message?: string };
  return (
    e.name === "AbortError" ||
    e.name === "APIUserAbortError" ||
    /abort/i.test(e.message ?? "")
  );
}

// ============================================================
// runStreamingAgentLoop
// ------------------------------------------------------------
// Step 5 的核心。while(true) 循环里：
//   1. 发 responses.create({ stream: true })
//   2. 遍历 async iterator，分发事件
//   3. 收集文本 + tool call
//   4. 遇到 tool call → 本地执行 → 推 history → 回到步骤 1 再来一轮
//   5. 没有 tool call → 把累积文本作为 assistant 写回 history → return
// ============================================================
async function runStreamingAgentLoop(opts: {
  state: import("./session.js").SessionState;
  write: SSEWriter;
  getAbortSignal: () => AbortSignal;
  resetAbort: () => void;
}): Promise<void> {
  const { state, write, getAbortSignal, resetAbort } = opts;

  const MAX_STEPS = 8; // 安全阀：最多 8 轮 agent 循环

  for (let step = 0; step < MAX_STEPS; step++) {
    resetAbort();

    const stream = await client.responses.create(
      {
        model: MODEL,
        input: state.chatHistory,
        tools,
        stream: true,
      },
      { signal: getAbortSignal() },
    );

    // 本轮累积
    let text = "";
    let hadToolCall = false;
    const pending = new Map<
      string,
      { name: string; args: string; call_id: string }
    >();

    for await (const ev of stream) {
      switch (ev.type) {
        // --- 文本流 -----------------------------------------
        case "response.output_text.delta": {
          text += ev.delta;
          write("delta", { text: ev.delta });
          break;
        }

        // --- Item 开始 ---------------------------------------
        // 两种情况：message（普通文本）或 function_call（工具调用）
        case "response.output_item.added": {
          if (ev.item.type === "function_call") {
            hadToolCall = true;
            // 流式时 id 一定存在；TS 类型包含了非流式场景所以标成可选。
            const itemId = ev.item.id ?? ev.item.call_id;
            pending.set(itemId, {
              name: ev.item.name,
              args: "",
              call_id: ev.item.call_id,
            });
            write("tool_start", { id: itemId, name: ev.item.name });
          }
          break;
        }

        // --- 工具参数 token by token ------------------------
        case "response.function_call_arguments.delta": {
          const buf = pending.get(ev.item_id);
          if (buf) buf.args += ev.delta;
          write("tool_args_delta", { id: ev.item_id, delta: ev.delta });
          break;
        }

        // --- Item 结束：function_call 完成，可以本地执行了 （文本不需要考虑）--
        case "response.output_item.done": {
          if (ev.item.type === "function_call") {
            const parsed = safeParseJSON(ev.item.arguments ?? "{}");
            const result = await runTool(ev.item.name, parsed);

            // 关键：把"函数调用本体" + "函数调用结果"都塞回 history
            // 这是 Responses API 要求的配对结构
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

        case "response.completed": {
          // 累计 token 计数，供调试/成本观察
          const u = ev.response.usage;
          if (u) {
            state.metadata.totalInTokens += u.input_tokens ?? 0;
            state.metadata.totalOutTokens += u.output_tokens ?? 0;
          }
          break;
        }

        case "error": {
          throw new Error("stream reported error event");
        }
      }
    }

    if (!hadToolCall) {
      // 没有工具调用 → 纯文本回复结束
      if (text.length > 0) {
        state.chatHistory.push({ role: "assistant", content: text });
      }
      return;
    }
    // 有工具调用 → 继续下一轮 agent loop（history 已经被填好）
  }

  write("error", { message: `agent loop exceeded ${MAX_STEPS} steps` });
}

function safeParseJSON(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

// ============================================================
// 全局错误兜底
// ============================================================
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("[server error]", err);
    if (!res.headersSent) {
      res
        .status(500)
        .json({ ok: false, error: err.message || "internal error" });
    } else {
      res.end();
    }
  },
);

// ============================================================
// Start
// ============================================================
const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  console.log(`🟢 Lesson 14 streaming chat server on http://localhost:${PORT}`);
  console.log(`   POST /api/chat/stream    SSE`);
  console.log(`   POST /api/chat/reset`);
  console.log(`   GET  /healthz`);
  // prewarm session map slot used at repl — for dev convenience
  newSession();
});
