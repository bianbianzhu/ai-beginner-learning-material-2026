import { Bubble } from "./Bubble.tsx";
import type { Msg } from "../types.ts";

export function MessageList({ messages }: { messages: Msg[] }) {
  return (
    <div className="message-list">
      {messages.map((m) => (
        <Bubble key={m.id} msg={m} />
      ))}
    </div>
  );
}
