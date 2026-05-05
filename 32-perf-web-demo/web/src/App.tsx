import { useSlowChat } from "./hooks/useSlowChat.ts";
import { useStreamingChat } from "./hooks/useStreamingChat.ts";
import { MessageList } from "./components/MessageList.tsx";
import { Composer } from "./components/Composer.tsx";
import { StatsBar } from "./components/StatsBar.tsx";

// Lesson 32 · App.tsx
// 左右分栏：同一个 Composer 同时把问题发给 /slow 和 /fast。
// 学生能直接「看到」感知速度的差距：左边在转圈时，右边已经在飙字了。

export default function App() {
  const slow = useSlowChat();
  const fast = useStreamingChat();

  const handleSend = (text: string) => {
    slow.send(text);
    fast.send(text);
  };

  const isWorking = slow.isPending || fast.isStreaming;

  return (
    <div className="app">
      <div className="split">
        <div className="pane" data-testid="pane-slow">
          <div className="pane-header slow">⏳ Slow · 非-streaming</div>
          <MessageList messages={slow.messages} />
          <StatsBar stats={slow.stats} />
        </div>
        <div className="pane" data-testid="pane-fast">
          <div className="pane-header fast">⚡ Fast · streaming</div>
          <MessageList messages={fast.messages} />
          <StatsBar stats={fast.stats} />
        </div>
      </div>
      <Composer onSend={handleSend} disabled={isWorking} />
    </div>
  );
}
