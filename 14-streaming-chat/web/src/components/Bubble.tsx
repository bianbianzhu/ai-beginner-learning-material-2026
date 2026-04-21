import type { Msg } from "../types";
import { ToolBubble } from "./ToolBubble";

export function Bubble({ msg }: { msg: Msg }) {
  if (msg.role === "user") {
    return (
      <div className="bubble-row bubble-row-user">
        <div className="bubble bubble-user">{msg.content}</div>
      </div>
    );
  }

  const showCursor = msg.status === "streaming" && msg.content.length > 0;

  return (
    <div className="bubble-row bubble-row-assistant">
      <div className="bubble bubble-assistant">
        {msg.toolCalls.map((c) => (
          <ToolBubble key={c.id} call={c} />
        ))}

        {msg.content && (
          <span className="bubble-content">
            {msg.content}
            {showCursor && <span className="cursor">▋</span>}
          </span>
        )}

        {msg.status === "streaming" && msg.content.length === 0 && msg.toolCalls.length === 0 && (
          <span className="typing">
            <span className="dot" /><span className="dot" /><span className="dot" />
          </span>
        )}

        {msg.status === "error" && (
          <div className="bubble-error">⚠️ {msg.errorMessage ?? "stream failed"}</div>
        )}

        {msg.status === "aborted" && (
          <div className="bubble-hint">⏹ 已停止</div>
        )}
      </div>
    </div>
  );
}
