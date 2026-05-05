import { useState, useCallback } from "react";
import type { Msg, Stats } from "../types.ts";

// Lesson 32 · useSlowChat.ts
// 老土的用法：fetch + 等整段 JSON 回来 + 一次性 setState。
// 用户在「等待」期间什么都看不到，只能转圈。

export function useSlowChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [stats, setStats] = useState<Stats>({});
  const [isPending, setIsPending] = useState(false);

  const send = useCallback(async (question: string) => {
    setIsPending(true);
    setStats({});

    const userMsg: Msg = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
      status: "complete",
    };
    const placeholder: Msg = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "loading...",
      status: "pending",
    };
    setMessages((m) => [...m, userMsg, placeholder]);

    try {
      const resp = await fetch("/api/chat/slow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await resp.json();
      if (!data.ok) throw new Error(data.error ?? "unknown");

      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = {
          ...placeholder,
          content: data.answer,
          status: "complete",
        };
        return next;
      });
      setStats({
        total_ms: data.total_ms,
        output_tokens: data.output_tokens,
      });
    } catch (err) {
      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = {
          ...placeholder,
          content: `❌ ${(err as Error).message}`,
          status: "error",
        };
        return next;
      });
    } finally {
      setIsPending(false);
    }
  }, []);

  const reset = useCallback(() => {
    setMessages([]);
    setStats({});
  }, []);

  return { messages, stats, isPending, send, reset };
}
