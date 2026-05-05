import type { Stats } from "../types.ts";

export function StatsBar({ stats }: { stats: Stats }) {
  if (stats.total_ms === undefined && stats.ttft_ms === undefined) {
    return <div className="stats-bar">TTFT: —    Total: —    Tokens: —</div>;
  }
  const ttft = stats.ttft_ms === undefined ? "—" : `${stats.ttft_ms} ms`;
  const total = stats.total_ms === undefined ? "—" : `${stats.total_ms} ms`;
  const tokens = stats.output_tokens === undefined ? "—" : String(stats.output_tokens);
  return (
    <div className="stats-bar">
      TTFT: {ttft}    Total: {total}    Tokens: {tokens}
    </div>
  );
}
