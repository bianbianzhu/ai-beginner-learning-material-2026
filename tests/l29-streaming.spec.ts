import { test, expect } from "@playwright/test";
import { runPnpm } from "./helpers/spawn-pnpm.js";

const NETWORK = process.env.RUN_NETWORK_TESTS === "1";

test.describe("Lesson 29 · streaming + TTFT", () => {
  test.skip(!NETWORK, "Network test — set RUN_NETWORK_TESTS=1 to run");

  test("baseline.ts prints Total ms", async () => {
    const { stdout, code } = await runPnpm("l29:baseline", { timeoutMs: 60_000 });
    expect(code).toBe(0);
    expect(stdout).toMatch(/========== 非-streaming \(baseline\) ==========/);
    expect(stdout).toMatch(/Total:\s+\d+ ms/);
    expect(stdout).toMatch(/Tokens:\s+\d+/);
  });

  test("streaming.ts prints TTFT + Total, TTFT < Total", async () => {
    const { stdout, code } = await runPnpm("l29", { timeoutMs: 60_000 });
    expect(code).toBe(0);
    expect(stdout).toMatch(/========== streaming ==========/);

    const ttftMatch = stdout.match(/TTFT:\s+(\d+) ms/);
    const totalMatch = stdout.match(/Total:\s+(\d+) ms/);
    expect(ttftMatch).not.toBeNull();
    expect(totalMatch).not.toBeNull();

    const ttft = Number(ttftMatch![1]);
    const total = Number(totalMatch![1]);
    expect(ttft).toBeGreaterThan(0);
    expect(total).toBeGreaterThan(ttft);
  });
});
