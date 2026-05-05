import { useState, useCallback, useRef } from "react";
import type { Msg, Stats } from "../types.ts";

// Lesson 32 · useStreamingChat.ts
// 流式版本：fetch + ReadableStream + 解析 SSE 帧 + 增量 setState。
// 用户在第一个 delta 到达时（TTFT）就开始看到字。
//
// 这个 hook 是从 14-streaming-chat/web/src/useStreamingChat.ts 简化得到：
// - 去掉了 tool_call 处理
// - 去掉了 session reset 调用
// - 简化为单轮对话（messages 不会跨轮累积，每次 send 重置）

interface FrameEvent {
  event: string;
  data: unknown;
}

function parseFrame(raw: string): FrameEvent | null {
  let event = "message";
  let dataStr = "";
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
  }
  if (!dataStr) return null;
  try {
    return { event, data: JSON.parse(dataStr) };
  } catch {
    return null;
  }
}

export function useStreamingChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [stats, setStats] = useState<Stats>({});
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(async (question: string) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setIsStreaming(true);
    setStats({});

    const userMsg: Msg = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
      status: "complete",
    };
    const assistantId = crypto.randomUUID();
    const assistantMsg: Msg = {
      id: assistantId,
      role: "assistant",
      content: "",
      status: "streaming",
    };
    setMessages((m) => [...m, userMsg, assistantMsg]);

    try {
      const resp = await fetch("/api/chat/fast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
        signal: ac.signal,
      });
      if (!resp.ok || !resp.body) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const raw = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const frame = parseFrame(raw);
          if (!frame) continue;

          if (frame.event === "delta") {
            const text = (frame.data as { text: string }).text;
            setMessages((m) =>
              m.map((msg) =>
                msg.id === assistantId
                  ? { ...msg, content: msg.content + text }
                  : msg,
              ),
            );
          } else if (frame.event === "done") {
            const d = frame.data as Stats;
            setStats(d);
            setMessages((m) =>
              m.map((msg) =>
                msg.id === assistantId ? { ...msg, status: "complete" } : msg,
              ),
            );
          } else if (frame.event === "error") {
            const msg = (frame.data as { message: string }).message;
            setMessages((m) =>
              m.map((msg2) =>
                msg2.id === assistantId
                  ? { ...msg2, content: `❌ ${msg}`, status: "error" }
                  : msg2,
              ),
            );
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantId
            ? { ...msg, content: `❌ ${(err as Error).message}`, status: "error" }
            : msg,
        ),
      );
    } finally {
      setIsStreaming(false);
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setStats({});
  }, []);

  return { messages, stats, isStreaming, send, reset };
}
