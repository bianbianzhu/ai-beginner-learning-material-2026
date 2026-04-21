/**
 * useStreamingChat —— Lesson 14 核心前端 hook
 * ──────────────────────────────────────────────────────────
 *   1. 发起 fetch POST /api/chat/stream
 *   2. 读 ReadableStream，用 TextDecoder(stream:true) 解码
 *   3. 按 "\n\n" 切 SSE 帧，解析 event + data
 *   4. 按事件名分发到 setMessages
 *
 * 事件契约（与 server.ts 对齐）：
 *   delta           { text }                          文本 token
 *   tool_start      { id, name }                      一个工具调用开始
 *   tool_args_delta { id, delta }                     参数 JSON 字符串片段
 *   tool_result     { id, result }                    工具本地执行完成
 *   done            { turnCount }                     整轮结束
 *   error           { message }                       后端报错
 */

import { useCallback, useRef, useState } from "react";
import type { Msg, ToolCallView } from "./types";

type SendOpts = { retryOfUserText?: string };

export function useStreamingChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  /** 当前正在 streaming 的 assistant msg.id */
  const activeAssistantIdRef = useRef<string | null>(null);

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(async () => {
    abortRef.current?.abort();
    setMessages([]);
    try {
      await fetch("/api/chat/reset", { method: "POST", credentials: "include" });
    } catch {
      // 忽略（offline 也要能清本地）
    }
  }, []);

  const send = useCallback(
    async (userText: string, opts: SendOpts = {}) => {
      const text = userText.trim();
      if (!text || isStreaming) return;

      const assistantId = crypto.randomUUID();
      activeAssistantIdRef.current = assistantId;

      // 关键 UX：先插入 user + 空 assistant 占位，用户立刻看到"typing..."
      // 如果是 retry，不要重复插 user
      setMessages((prev) => {
        const next = [...prev];
        if (!opts.retryOfUserText) {
          next.push({
            id: crypto.randomUUID(),
            role: "user",
            content: text,
            status: "done",
            createdAt: Date.now(),
          });
        }
        next.push({
          id: assistantId,
          role: "assistant",
          content: "",
          status: "streaming",
          createdAt: Date.now(),
          toolCalls: [],
        });
        return next;
      });

      setIsStreaming(true);
      const ac = new AbortController();
      abortRef.current = ac;

      try {
        const resp = await fetch("/api/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ message: text }),
          signal: ac.signal,
        });

        if (!resp.ok || !resp.body) {
          throw new Error(`HTTP ${resp.status}`);
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buf = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buf += decoder.decode(value, { stream: true });

          // 按 SSE 帧边界（空行）切。最后一段可能不完整，留回 buf。
          const frames = buf.split("\n\n");
          buf = frames.pop() ?? "";

          for (const frame of frames) {
            const parsed = parseFrame(frame);
            if (!parsed) continue;
            dispatch(assistantId, parsed.event, parsed.data, setMessages);
          }
        }

        // 结束：标记为 done（如果还在 streaming）
        finalizeStatus(assistantId, "done", setMessages);
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          finalizeStatus(assistantId, "aborted", setMessages);
        } else {
          finalizeStatus(assistantId, "error", setMessages, (err as Error).message);
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
        activeAssistantIdRef.current = null;
      }
    },
    [isStreaming]
  );

  const retry = useCallback(() => {
    // 找到最后一条 user 消息，重发
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;

    // 把之前失败的 assistant 抹掉
    setMessages((prev) => {
      const next = [...prev];
      while (next.length && next[next.length - 1].role !== "user") next.pop();
      return next;
    });
    void send(lastUser.content, { retryOfUserText: lastUser.content });
  }, [messages, send]);

  return { messages, isStreaming, send, abort, reset, retry };
}

// ─────────────────────────────────────────────────────────
// 帮助函数
// ─────────────────────────────────────────────────────────

function parseFrame(raw: string): { event: string; data: unknown } | null {
  const frame = raw.trim();
  if (!frame) return null;
  let event = "message";
  const dataLines: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    // 其他字段（id/retry/comment）本课不需要
  }
  if (dataLines.length === 0) return null;
  try {
    return { event, data: JSON.parse(dataLines.join("\n")) };
  } catch {
    return null;
  }
}

function dispatch(
  assistantId: string,
  event: string,
  data: unknown,
  setMessages: React.Dispatch<React.SetStateAction<Msg[]>>
) {
  setMessages((prev) => prev.map((m) => applyEvent(m, assistantId, event, data)));
}

function applyEvent(m: Msg, assistantId: string, event: string, data: unknown): Msg {
  if (m.role !== "assistant" || m.id !== assistantId) return m;

  switch (event) {
    case "delta": {
      const text = (data as { text?: string }).text ?? "";
      return { ...m, content: m.content + text };
    }

    case "tool_start": {
      const { id, name } = data as { id: string; name: string };
      const nextCall: ToolCallView = { id, name, argsText: "", phase: "pending" };
      return { ...m, toolCalls: [...m.toolCalls, nextCall] };
    }

    case "tool_args_delta": {
      const { id, delta } = data as { id: string; delta: string };
      return {
        ...m,
        toolCalls: m.toolCalls.map((c) =>
          c.id === id ? { ...c, argsText: c.argsText + delta, phase: "running" } : c
        ),
      };
    }

    case "tool_result": {
      const { id, result } = data as { id: string; result: unknown };
      return {
        ...m,
        toolCalls: m.toolCalls.map((c) =>
          c.id === id ? { ...c, result, phase: "done" } : c
        ),
      };
    }

    case "done": {
      return { ...m, status: m.status === "streaming" ? "done" : m.status };
    }

    case "error": {
      const msg = (data as { message?: string }).message ?? "unknown error";
      return { ...m, status: "error", errorMessage: msg };
    }

    default:
      return m;
  }
}

function finalizeStatus(
  assistantId: string,
  status: "done" | "error" | "aborted",
  setMessages: React.Dispatch<React.SetStateAction<Msg[]>>,
  errorMessage?: string
) {
  setMessages((prev) =>
    prev.map((m) => {
      if (m.role !== "assistant" || m.id !== assistantId) return m;
      if (m.status !== "streaming") return m; // 已经被 server 的 done/error 先设过了
      return { ...m, status, errorMessage };
    })
  );
}
