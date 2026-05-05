import { test, expect } from "@playwright/test";
import { runPnpm } from "./helpers/spawn-pnpm.js";

const NETWORK = process.env.RUN_NETWORK_TESTS === "1";

function parseCachedLines(stdout: string): Array<{ cached: number; input: number }> {
  // Matches lines like "  cached_tokens=1920/2000" (compact form used by prefix-order.ts)
  const compact = [...stdout.matchAll(/cached(?:_tokens)?[=:]\s*(\d+)(?:\/(\d+))?/g)];
  return compact.map((m) => ({
    cached: Number(m[1]),
    input: m[2] ? Number(m[2]) : NaN,
  }));
}

test.describe("Lesson 30 · Prompt Caching", () => {
  test.skip(!NETWORK, "Network test — set RUN_NETWORK_TESTS=1 to run");

  test("cache-hit.ts shows cold→warm cache jump", async () => {
    const { stdout, code } = await runPnpm("l30", { timeoutMs: 60_000 });
    expect(code).toBe(0);

    expect(stdout).toMatch(/Call 1 \(cold\)/);
    expect(stdout).toMatch(/Call 2 \(warm\)/);

    // Find the two cached_tokens numbers; first should be 0, second should be > 100
    const lines = stdout.split("\n");
    const call1Block = lines.findIndex((l) => l.includes("Call 1"));
    const call2Block = lines.findIndex((l) => l.includes("Call 2"));
    expect(call1Block).toBeGreaterThanOrEqual(0);
    expect(call2Block).toBeGreaterThan(call1Block);

    const call1 = lines.slice(call1Block, call2Block).join("\n");
    const call2 = lines.slice(call2Block).join("\n");
    const c1 = call1.match(/cached_tokens:\s*(\d+)/);
    const c2 = call2.match(/cached_tokens:\s*(\d+)/);
    expect(c1).not.toBeNull();
    expect(c2).not.toBeNull();
    expect(Number(c1![1])).toBe(0);
    expect(Number(c2![1])).toBeGreaterThan(100);
  });

  test("prefix-order.ts shows good ordering beats bad", async () => {
    const { stdout, code } = await runPnpm("l30:order", { timeoutMs: 60_000 });
    expect(code).toBe(0);

    expect(stdout).toMatch(/Bad ordering/);
    expect(stdout).toMatch(/Good ordering/);

    const cached = parseCachedLines(stdout).map((p) => p.cached);
    expect(cached.length).toBeGreaterThanOrEqual(4);
    const [, badSecond, , goodSecond] = cached;
    expect(goodSecond).toBeGreaterThan(badSecond);
  });
});
