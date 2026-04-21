import { useEffect, useRef } from "react";
import type { Msg } from "../types";
import { Bubble } from "./Bubble";

/**
 * 智能自动滚动：只在"用户正在底部附近"时才跟随。
 * 如果用户已经向上翻看历史，就不强拉回底部——符合产品直觉。
 */
export function MessageList({ messages }: { messages: Msg[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      wasAtBottomRef.current = distanceFromBottom < 100;
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (wasAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="messages" ref={containerRef}>
      {messages.length === 0 && (
        <div className="empty">
          <h2>👋 开始对话</h2>
          <p>试试问：</p>
          <ul>
            <li>"Tokyo 现在天气怎么样？"（触发流式 tool call）</li>
            <li>"写一首关于春天的短诗"（纯文本流）</li>
            <li>"我叫李天一" → 下一轮 "我叫什么？"（验证记忆）</li>
          </ul>
        </div>
      )}
      {messages.map((m) => (
        <Bubble key={m.id} msg={m} />
      ))}
    </div>
  );
}
