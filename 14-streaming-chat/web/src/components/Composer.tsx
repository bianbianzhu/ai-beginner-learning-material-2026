import { useRef, useState, type KeyboardEvent } from "react";

type Props = {
  disabled: boolean;
  isStreaming: boolean;
  onSend: (text: string) => void;
  onAbort: () => void;
  onReset: () => void;
  canRetry: boolean;
  onRetry: () => void;
};

export function Composer({
  disabled,
  isStreaming,
  onSend,
  onAbort,
  onReset,
  canRetry,
  onRetry,
}: Props) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const text = value.trim();
    if (!text) return;
    setValue("");
    onSend(text);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter 发送，Shift+Enter 换行
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={isStreaming ? "AI 正在回答…" : "输入消息，Enter 发送，Shift+Enter 换行"}
        rows={1}
        disabled={disabled}
      />

      {isStreaming ? (
        <button type="button" className="btn btn-stop" onClick={onAbort}>
          停止
        </button>
      ) : (
        <button type="submit" className="btn btn-send" disabled={!value.trim()}>
          发送
        </button>
      )}

      {canRetry && !isStreaming && (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          重试
        </button>
      )}

      <button type="button" className="btn btn-ghost" onClick={onReset} disabled={isStreaming}>
        清空
      </button>
    </form>
  );
}
