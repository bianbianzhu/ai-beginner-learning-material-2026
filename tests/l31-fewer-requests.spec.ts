import { test, expect } from "@playwright/test";
import { runPnpm } from "./helpers/spawn-pnpm.js";

const NETWORK = process.env.RUN_NETWORK_TESTS === "1";

function parseTotals(stdout: string): number[] {
  return [...stdout.matchAll(/Total:\s+(\d+) ms/g)].map((m) => Number(m[1]));
}

test.describe("Lesson 31 · Make fewer requests + Parallelize", () => {
  test.skip(!NETWORK, "Network test — set RUN_NETWORK_TESTS=1 to run");

  test("combine.ts: combined call beats sequential 2-call", async () => {
    const { stdout, code } = await runPnpm("l31", { timeoutMs: 60_000 });
    expect(code).toBe(0);
    expect(stdout).toMatch(/2 次顺序调用/);
    expect(stdout).toMatch(/1 次合并调用/);

    const totals = parseTotals(stdout);
    expect(totals.length).toBeGreaterThanOrEqual(2);
    const [bad, good] = totals;
    // Combined should be faster, allow 10% slack for noise
    expect(good).toBeLessThan(bad);
  });

  test("parallel.ts: Promise.all beats sequential 3-call", async () => {
    const { stdout, code } = await runPnpm("l31:parallel", { timeoutMs: 60_000 });
    expect(code).toBe(0);
    expect(stdout).toMatch(/顺序 await 三次/);
    expect(stdout).toMatch(/Promise\.all 同时发三次/);

    const totals = parseTotals(stdout);
    expect(totals.length).toBeGreaterThanOrEqual(2);
    const [seq, par] = totals;
    expect(par).toBeLessThan(seq);
  });
});
