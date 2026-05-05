import { spawn } from "node:child_process";

export interface PnpmResult {
  stdout: string;
  stderr: string;
  code: number;
}

// Spawn `pnpm <script>` from the repo root, capture stdout/stderr, return on exit.
// Used by lesson tests that just need to verify a CLI script's printed output.
export function runPnpm(
  script: string,
  opts: { timeoutMs?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<PnpmResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn("pnpm", [script], {
      env: { ...process.env, ...opts.env },
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    const timer = opts.timeoutMs
      ? setTimeout(() => proc.kill("SIGTERM"), opts.timeoutMs)
      : null;
    proc.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? -1 });
    });
    proc.on("error", reject);
  });
}
