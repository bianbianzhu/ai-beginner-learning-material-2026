/**
 * Session 中间件 —— 沿用 Lesson 13 的设计
 * ----------------------------------------
 *   客户端只持有一个 `session_id` HTTP-only cookie
 *   所有历史在服务端 Map 里
 */

import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import type { ResponseInputItem } from "openai/resources/responses/responses.mjs";

export type SessionState = {
  // chatHistory 是 Responses API 的 input 数组
  // 既可以是 {role, content} message，也可以是 function_call / function_call_output item
  chatHistory: ResponseInputItem[];
  metadata: {
    createdAt: string;
    lastUsedAt: string;
    turnCount: number;
    totalInTokens: number;
    totalOutTokens: number;
  };
};

const DEVELOPER_INSTRUCTIONS = `
You are a helpful chat assistant for a web app.
- Keep answers concise (<= 4 sentences).
- When the user asks about weather or current time, USE THE TOOLS instead of guessing.
- Tools available: get_weather, get_current_time.
- Remember facts the user shares within this conversation.
`.trim();

const sessions = new Map<string, SessionState>();

export function newSession(): SessionState {
  const now = new Date().toISOString();
  return {
    chatHistory: [
      { role: "developer", content: DEVELOPER_INSTRUCTIONS } as ResponseInputItem,
    ],
    metadata: {
      createdAt: now,
      lastUsedAt: now,
      turnCount: 0,
      totalInTokens: 0,
      totalOutTokens: 0,
    },
  };
}

export function resetSession(sid: string): void {
  sessions.set(sid, newSession());
}

// 注意：Lesson 13 已经在全局 augment 过 Request.sessionState，
// 两课同开会冲突。这里不再 augment，用 WeakMap 做"请求 → state"映射，
// handler 里通过 getState(req) 拿。
const stateByRequest = new WeakMap<Request, SessionState>();
const sidByRequest = new WeakMap<Request, string>();

export function getState(req: Request): SessionState {
  const s = stateByRequest.get(req);
  if (!s) throw new Error("session not initialized — did you add sessionMiddleware?");
  return s;
}

export function getSessionId(req: Request): string {
  const sid = sidByRequest.get(req);
  if (!sid) throw new Error("session id not set");
  return sid;
}

const COOKIE_NAME = "session_id";
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 1000 * 60 * 60 * 24, // 24h
  path: "/",
};

export function sessionMiddleware(req: Request, res: Response, next: NextFunction): void {
  let sid = req.cookies?.[COOKIE_NAME];
  if (!sid || typeof sid !== "string") {
    sid = randomUUID();
    res.cookie(COOKIE_NAME, sid, COOKIE_OPTIONS);
  }
  sidByRequest.set(req, sid);

  if (!sessions.has(sid)) sessions.set(sid, newSession());
  const state = sessions.get(sid)!;
  state.metadata.lastUsedAt = new Date().toISOString();
  stateByRequest.set(req, state);

  next();
}
