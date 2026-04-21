import type { ToolCallView } from "../types";

/**
 * Tool 调用气泡
 * 三个 phase：
 *   pending  – 刚开始，参数还在流入
 *   running  – 参数流完了，本地正在执行（一般很快就切到 done）
 *   done     – 结果返回
 */
export function ToolBubble({ call }: { call: ToolCallView }) {
  return (
    <div className={`tool tool-${call.phase}`}>
      <div className="tool-header">
        <span className="tool-icon">
          {call.phase === "done" ? "✅" : "⚙️"}
        </span>
        <span className="tool-name">{call.name}</span>
        <span className="tool-phase">{phaseLabel(call.phase)}</span>
      </div>

      <pre className="tool-args">
        {call.argsText || "（参数填充中…）"}
      </pre>

      {call.phase === "done" && call.result !== undefined && (
        <pre className="tool-result">{formatResult(call.result)}</pre>
      )}
    </div>
  );
}

function phaseLabel(p: ToolCallView["phase"]): string {
  switch (p) {
    case "pending": return "参数流入中";
    case "running": return "执行中";
    case "done":    return "完成";
  }
}

function formatResult(r: unknown): string {
  try {
    return JSON.stringify(r, null, 2);
  } catch {
    return String(r);
  }
}
