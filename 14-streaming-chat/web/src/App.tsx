import { useMemo } from "react";
import { useStreamingChat } from "./useStreamingChat";
import { MessageList } from "./components/MessageList";
import { Composer } from "./components/Composer";

export function App() {
  const { messages, isStreaming, send, abort, reset, retry } = useStreamingChat();

  const canRetry = useMemo(() => {
    const last = messages[messages.length - 1];
    return !!last && last.role === "assistant" && (last.status === "error" || last.status === "aborted");
  }, [messages]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Lesson 14 · Streaming Chat</h1>
        <span className="subtitle">
          OpenAI Responses API · <code>gpt-5.4-nano</code> · SSE
        </span>
      </header>

      <main className="app-main">
        <MessageList messages={messages} />
      </main>

      <footer className="app-footer">
        <Composer
          disabled={false}
          isStreaming={isStreaming}
          onSend={send}
          onAbort={abort}
          onReset={reset}
          canRetry={canRetry}
          onRetry={retry}
        />
      </footer>
    </div>
  );
}
