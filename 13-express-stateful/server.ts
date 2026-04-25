/**
 * Lesson 13 · Express 有状态聊天 API（sessionId cookie + 服务端 Map）
 * -----------------------------------------------------------
 * 目标：写一个真正的多用户、多会话的聊天 API。
 *
 * 状态怎么存？一个 new Map，key 是 sessionId，value 是该会话的完整状态：
 *
 *   const sessions = new Map<string, {
 *     chatHistory: Message[];
 *     metadata: { createdAt, lastUsedAt, turnCount, totalInTokens, totalOutTokens };
 *   }>();
 *
 * 客户端只携带一个 `session_id` HTTP-only cookie；所有历史都在服务端。
 *
 * 2026 里还有哪些别的做法？（见本文件底部 "Alternatives" 注释）
 *
 * 路由：
 *   POST /api/chat         { message } → { reply, usage, turnCount }
 *   POST /api/chat/reset   → 清空当前 session
 *   GET  /api/chat/debug   → 返回 session 的完整状态（教学用，生产不要开）
 *   GET  /healthz          → 健康检查
 *
 * 运行：pnpm l13
 * 测试（curl 要加 -b / -c 才能带 cookie）：
 *   curl -s -c jar.txt -b jar.txt -X POST http://localhost:3000/api/chat \
 *        -H "Content-Type: application/json" \
 *        -d '{"message":"my name is Tianyi"}'
 *
 *   curl -s -c jar.txt -b jar.txt -X POST http://localhost:3000/api/chat \
 *        -H "Content-Type: application/json" \
 *        -d '{"message":"what is my name?"}'
 */

import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import { randomUUID } from "node:crypto";
import OpenAI from "openai";

const client = new OpenAI();

// ==================== Session 存储 ====================
type Message = { role: "user" | "assistant" | "developer"; content: string };

type SessionState = {
  chatHistory: Message[];
  metadata: {
    createdAt: string;
    lastUsedAt: string;
    turnCount: number;
    totalInTokens: number;
    totalOutTokens: number;
  };
};

// 服务端内存 Map —— 教学用。生产应换成 Redis / SQLite 等持久化存储。
const sessions = new Map<string, SessionState>();

const DEVELOPER_INSTRUCTIONS = `
You are a helpful chat assistant for a web app.
Keep answers concise (<= 4 sentences). Remember facts the user shares.
`.trim();

function newSession(): SessionState {
  const now = new Date().toISOString();
  return {
    chatHistory: [{ role: "developer", content: DEVELOPER_INSTRUCTIONS }],
    metadata: {
      createdAt: now,
      lastUsedAt: now,
      turnCount: 0,
      totalInTokens: 0,
      totalOutTokens: 0,
    },
  };
}

// ==================== App setup ====================
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

const COOKIE_NAME = "session_id";
const COOKIE_OPTIONS = {
  httpOnly: true, // JS 读不到，防 XSS
  sameSite: "lax" as const, // 基础 CSRF 防护
  secure: process.env.NODE_ENV === "production", // 生产必须 HTTPS
  maxAge: 1000 * 60 * 60 * 24, // 24h
  path: "/",
};

/**
 * 中间件：确保每个请求都有 sessionId，挂到 req.sessionId 上。
 * 没 cookie → 生成一个 UUID，Set-Cookie 回去。
 */
declare module "express-serve-static-core" {
  interface Request {
    sessionId?: string;
    sessionState?: SessionState;
  }
}

app.use((req, res, next) => {
  let sid = req.cookies?.[COOKIE_NAME];
  if (!sid || typeof sid !== "string") {
    sid = randomUUID();
    res.cookie(COOKIE_NAME, sid, COOKIE_OPTIONS);
  }
  req.sessionId = sid;

  if (!sessions.has(sid)) sessions.set(sid, newSession());
  req.sessionState = sessions.get(sid)!;

  next();
});

// ==================== Routes ====================
app.get("/healthz", (_req, res) => {
  res.json({ ok: true, activeSessions: sessions.size });
});

app.post("/api/chat", async (req, res) => {
  const { message } = req.body ?? {};
  if (typeof message !== "string" || message.trim().length === 0) {
    return res
      .status(400)
      .json({ ok: false, error: "field `message` is required" });
  }
  if (message.length > 4000) {
    return res
      .status(400)
      .json({ ok: false, error: "message too long (max 4000 chars)" });
  }

  const state = req.sessionState!;
  state.chatHistory.push({ role: "user", content: message });

  const response = await client.responses.create({
    model: "gpt-5.4-nano",
    input: state.chatHistory,
  });

  const reply = response.output_text;
  state.chatHistory.push({ role: "assistant", content: reply });

  // 更新 metadata
  state.metadata.lastUsedAt = new Date().toISOString();
  state.metadata.turnCount += 1;
  state.metadata.totalInTokens += response.usage?.input_tokens ?? 0;
  state.metadata.totalOutTokens += response.usage?.output_tokens ?? 0;

  res.json({
    ok: true,
    data: {
      reply,
      usage: response.usage,
      turnCount: state.metadata.turnCount,
    },
  });
});

app.post("/api/chat/reset", (req, res) => {
  sessions.set(req.sessionId!, newSession());
  res.json({ ok: true });
});

// 仅供教学/调试 —— 看看服务端到底存了啥
app.get("/api/chat/debug", (req, res) => {
  res.json({
    ok: true,
    data: { sessionId: req.sessionId, state: req.sessionState },
  });
});

// ==================== Error handler ====================
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("[server error]", err);
    res.status(500).json({ ok: false, error: err.message || "internal error" });
  },
);

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  console.log(`🟢 Lesson 13 stateful chat server on http://localhost:${PORT}`);
  console.log(`   POST /api/chat         { message }`);
  console.log(`   POST /api/chat/reset`);
  console.log(`   GET  /api/chat/debug`);
});

/*
======================================================================
📚 拓展：2026 还有哪些别的 session 管理方式？
======================================================================

方案 A（本课用的）：服务端 Map + HTTP-only cookie
  优点：客户端什么都不用做；隐私好（历史不在前端）；一切都可控
  缺点：服务器重启会丢；需要自己做 GC；多实例部署要共享存储（→ Redis）

方案 B：客户端每次带完整 history（类似 JWT 思路）
  优点：服务端完全无状态，横向扩展零成本
  缺点：请求变大；历史会被客户端看到（或篡改）；token 成本客户端承担不了意识

方案 C：用 OpenAI Responses API 的 `previous_response_id` 服务端托管
  做法：存一个 lastResponseId 在 session 里（很小），下一次请求传 previous_response_id
  优点：OpenAI 帮你管历史（30 天），客户端只存一个 id，本地不用维护 history
  注意：每次仍按 input tokens 计费；OpenAI 保留数据
  代码：const resp = await client.responses.create({ previous_response_id: state.lastId, input: [...] });

方案 D：Conversations API（Responses 的姐妹 API）
  做法：openai.conversations.create() 拿到 conversation_id，之后每次请求带 conversation 参数
  优点：长期、持久、跨设备都能继续同一个对话
  适用：需要"长期记忆"的场景（agent、assistant、coach 等）
*/
