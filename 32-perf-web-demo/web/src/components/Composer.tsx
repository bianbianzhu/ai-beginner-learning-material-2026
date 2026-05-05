import { useState, type KeyboardEvent } from "react";

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function Composer({ onSend, disabled }: Props) {
  const [text, setText] = useState("");

  const fire = () => {
    const t = text.trim();
    if (!t || disabled) return;
    onSend(t);
    setText("");
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      fire();
    }
  };

  return (
    <div className="composer">
      <textarea
        rows={2}
        placeholder="问点什么...（Enter 发送，Shift+Enter 换行）"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKey}
        disabled={disabled}
        data-testid="composer-input"
      />
      <button onClick={fire} disabled={disabled || !text.trim()} data-testid="composer-send">
        发送
      </button>
    </div>
  );
}
