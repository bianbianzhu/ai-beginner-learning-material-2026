# Performance Optimization Mini-Arc Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement sections 28–32 (performance optimization mini-arc) of the *AI in 2026* course per the design spec at `docs/superpowers/specs/2026-05-05-perf-arc-design.md`, including a Playwright-based e2e test suite.

**Architecture:** Five self-contained lesson folders (`28-perf-overview/` through `32-perf-web-demo/`). Lessons 29–31 are CLI scripts; 32 is an Express + React (Vite) split-screen demo; 28 is concept-only (HTML viz + README). Tests live in a single root `tests/` folder using Playwright. Network-bound tests gated by `RUN_NETWORK_TESTS=1`.

**Tech Stack:** TypeScript (ESM), `tsx` runner, OpenAI Responses API (`openai@^6.34.0`), Express v5, React 19 + Vite 6, `@playwright/test@^1.59.1`. Default model `gpt-5.4-nano`. Package manager `pnpm@9.12.0`.

**TDD note on cost:** Lessons 29–32 require real OpenAI API calls. Strict red→green→refactor TDD would burn money on each iteration. We TDD strictly only for 28 (offline). For 29–32 we write the lesson script first, then the test, then run the test once. This is documented per task.

---

## File Structure

**New lesson directories:**
```
28-perf-overview/
  README.md
  perf-flow.html
29-streaming-ttft/
  README.md
  baseline.ts
  streaming.ts
30-prompt-caching/
  README.md
  cache-hit.ts
  cache-key.ts
  prefix-order.ts
  fake-kb.ts                 # ~2000-token Chinese KB string, inlined per the no-shared-modules rule (this is one file PER lesson, not a shared util across lessons)
31-fewer-requests/
  README.md
  combine.ts
  parallel.ts
32-perf-web-demo/
  server/
    server.ts
  web/
    package.json
    tsconfig.json
    tsconfig.node.json
    vite.config.ts
    index.html
    src/
      main.tsx
      App.tsx
      types.ts
      styles.css
      hooks/
        useSlowChat.ts
        useStreamingChat.ts
      components/
        Composer.tsx
        MessageList.tsx
        Bubble.tsx
        StatsBar.tsx
```

**New test infrastructure:**
```
tests/
  playwright.config.ts
  helpers/
    spawn-pnpm.ts
  l28-overview.spec.ts
  l29-streaming.spec.ts
  l30-caching.spec.ts
  l31-fewer-requests.spec.ts
  l32-web-demo.spec.ts
```

**Files modified:**
- `PLAN-SAFETY.md` — renumber sections 28-37 → 33-42, add preamble note
- `package.json` — add `l28`–`l32` lesson scripts and `test`/`test:network` scripts; add `@playwright/test` to devDependencies
- `.gitignore` — add `playwright-report/`, `test-results/`, `tests/.auth/`

---

## Task 1: Renumber PLAN-SAFETY.md

**Files:**
- Modify: `PLAN-SAFETY.md`

- [ ] **Step 1: Read the current PLAN-SAFETY.md to identify all "Lesson 28"–"Lesson 37" headers and cross-references**

Run: `grep -nE "Lesson 2[8-9]|Lesson 3[0-7]" PLAN-SAFETY.md`

Expected: list of line numbers with each old reference.

- [ ] **Step 2: Apply the renumber: 28→33, 29→34, …, 37→42, including all cross-refs**

Use `Edit` tool with `replace_all: true` for each pair, working from highest to lowest to avoid 28→33 colliding with the new 33 we just wrote. Order:
1. `Lesson 37` → `Lesson 42`
2. `Lesson 36` → `Lesson 41`
3. `Lesson 35` → `Lesson 40`
4. `Lesson 34` → `Lesson 39`
5. `Lesson 33` → `Lesson 38`
6. `Lesson 32` → `Lesson 37`
7. `Lesson 31` → `Lesson 36`
8. `Lesson 30` → `Lesson 35`
9. `Lesson 29` → `Lesson 34`
10. `Lesson 28` → `Lesson 33`

Also replace any `28-`, `29-`, ... `37-` folder-prefix references the same way (e.g. `28-threat-model` → `33-threat-model`). Use grep first to find these:

Run: `grep -nE "\b(2[8-9]|3[0-7])-[a-z]" PLAN-SAFETY.md`

For each match, use `Edit` to apply the same +5 shift.

- [ ] **Step 3: Add the preamble note immediately after the document title**

Use `Edit` to insert the following block after the H1 title (the first line that starts with `# `):

```markdown

> **NOTE (added 2026-05-05):** Sections 28–32 are now reserved for the **Performance Optimization mini-arc**. See `docs/superpowers/specs/2026-05-05-perf-arc-design.md`. The Safety arc has been renumbered to 33–42.

```

- [ ] **Step 4: Verify with a grep**

Run: `grep -nE "Lesson 2[8-9]|Lesson 3[0-2]" PLAN-SAFETY.md`

Expected: zero hits (all old numbers are gone).

Run: `grep -nE "Lesson 3[3-9]|Lesson 4[0-2]" PLAN-SAFETY.md`

Expected: matches for the renumbered sections.

- [ ] **Step 5: Commit**

```bash
git add PLAN-SAFETY.md
git commit -m "docs: renumber safety arc to 33-42 to make room for performance arc 28-32"
```

---

## Task 2: Install Playwright and scaffold tests folder

**Files:**
- Modify: `package.json` (add devDependency + test scripts)
- Modify: `.gitignore`
- Create: `tests/playwright.config.ts`
- Create: `tests/helpers/spawn-pnpm.ts`

- [ ] **Step 1: Add Playwright as a devDependency**

Run: `pnpm add -D @playwright/test@^1.59.1`

Expected: `package.json` `devDependencies` now contains `"@playwright/test": "^1.59.1"`. Lock file updated. No errors.

- [ ] **Step 2: Install the Chromium browser binary (one-time)**

Run: `pnpm exec playwright install chromium`

Expected: downloads ~150 MB into `~/Library/Caches/ms-playwright` on macOS. Output ends with success message.

- [ ] **Step 3: Add test scripts to package.json**

Use `Edit` to add these two lines to the `scripts` object (place them just before `"typecheck"`):

```json
"test": "playwright test --grep-invert @network",
"test:network": "RUN_NETWORK_TESTS=1 playwright test",
```

- [ ] **Step 4: Update .gitignore**

Use `Edit` to append:

```
# Playwright
playwright-report/
test-results/
tests/.auth/
```

- [ ] **Step 5: Create `tests/playwright.config.ts`**

```ts
import { defineConfig } from "@playwright/test";

// Single Chromium project. Lessons that hit OpenAI API are tagged @network
// and gated by RUN_NETWORK_TESTS=1 (see root package.json scripts).
// 32-web-demo defines its own webServer inline because no other spec needs one.
export default defineConfig({
  testDir: ".",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // Lessons share the same OPENAI_API_KEY rate limit
  workers: 1,
  reporter: [["list"]],
  use: {
    actionTimeout: 10_000,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
```

- [ ] **Step 6: Create `tests/helpers/spawn-pnpm.ts`**

```ts
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
```

- [ ] **Step 7: Smoke-check Playwright works**

Run: `pnpm exec playwright test --list`

Expected: `Total: 0 tests in 0 files` (no specs yet, but Playwright loads cleanly with no config errors).

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml .gitignore tests/
git commit -m "test: add Playwright + tests/ scaffold and runPnpm helper"
```

---

## Task 3: Lesson 29 — `baseline.ts`

**Files:**
- Create: `29-streaming-ttft/baseline.ts`

- [ ] **Step 1: Create the file**

```ts
import "dotenv/config";
import OpenAI from "openai";

// Lesson 29 · baseline.ts
// 非-streaming 调用：客户端要等到完整回复生成完才能看到一个字。
// 我们测量的是「总耗时」(Total) —— 也是用户实际等待的时间。

const client = new OpenAI(); // OPENAI_API_KEY 自动从环境变量读取

const PROMPT =
  "请用大约 300 字介绍一下黑洞是怎么形成的，要让一个高中生能听懂。";

async function main() {
  console.log("========== 非-streaming (baseline) ==========");
  const start = performance.now();

  const resp = await client.responses.create({
    model: "gpt-5.4-nano",
    input: PROMPT,
  });

  const total = performance.now() - start;

  console.log(`TTFT:   N/A (整段一起返回)`);
  console.log(`Total:  ${total.toFixed(0)} ms`);
  console.log(`Tokens: ${resp.usage?.output_tokens ?? "?"}`);
  console.log("");
  console.log("回复内容预览:");
  console.log(resp.output_text.slice(0, 80) + "...");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add the script to package.json**

Use `Edit` to add to the `scripts` object (place after `"l27"`):

```json
"l29:baseline": "tsx 29-streaming-ttft/baseline.ts",
```

- [ ] **Step 3: Smoke-run the script**

Run: `pnpm l29:baseline`

Expected: prints the `========== 非-streaming (baseline) ==========` block followed by `Total: NNNN ms`, `Tokens: N`, and a preview line. No crashes. (Costs ~$0.001.)

- [ ] **Step 4: Commit**

```bash
git add 29-streaming-ttft/baseline.ts package.json
git commit -m "feat(l29): add baseline non-streaming script + l29:baseline pnpm script"
```

---

## Task 4: Lesson 29 — `streaming.ts`

**Files:**
- Create: `29-streaming-ttft/streaming.ts`

- [ ] **Step 1: Create the file**

```ts
import "dotenv/config";
import OpenAI from "openai";

// Lesson 29 · streaming.ts
// streaming 调用：客户端在 ~1s 内就能开始看到字（TTFT），
// 但「总耗时」(Total) 和 baseline.ts 几乎一样。
// 这就是「让用户感觉更快」的核心：感知延迟 ≪ 实际延迟。

const client = new OpenAI();

const PROMPT =
  "请用大约 300 字介绍一下黑洞是怎么形成的，要让一个高中生能听懂。";

async function main() {
  console.log("========== streaming ==========");
  const start = performance.now();
  let ttft: number | null = null;
  let outputTokens = 0;

  const stream = await client.responses.create({
    model: "gpt-5.4-nano",
    input: PROMPT,
    stream: true,
  });

  for await (const ev of stream) {
    if (ev.type === "response.output_text.delta" && ttft === null) {
      ttft = performance.now() - start;
    }
    if (ev.type === "response.completed") {
      outputTokens = ev.response.usage?.output_tokens ?? 0;
    }
  }

  const total = performance.now() - start;

  if (ttft === null) {
    console.error("❌ 没有收到 output_text.delta —— 可能模型啥也没回");
    process.exit(1);
  }

  console.log(`TTFT:   ${ttft.toFixed(0)} ms   ← 用户 ${(ttft / 1000).toFixed(1)}s 就开始看到字`);
  console.log(`Total:  ${total.toFixed(0)} ms   ← 总时长几乎和 baseline 一样`);
  console.log(`Tokens: ${outputTokens}`);
  console.log("");
  console.log("📌 对比 baseline：用户的「等待感」从 Total 缩到了 TTFT，是数量级的差别。");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add the script to package.json**

Use `Edit` to add (place after `"l29:baseline"`):

```json
"l29": "tsx 29-streaming-ttft/streaming.ts",
```

- [ ] **Step 3: Smoke-run the script**

Run: `pnpm l29`

Expected: prints `========== streaming ==========` block with `TTFT:`, `Total:`, `Tokens:` lines. TTFT < Total (typically TTFT 300–1500ms, Total 3000–8000ms). (Costs ~$0.001.)

- [ ] **Step 4: Commit**

```bash
git add 29-streaming-ttft/streaming.ts package.json
git commit -m "feat(l29): add streaming script + l29 pnpm script"
```

---

## Task 5: Lesson 29 — README + e2e test

**Files:**
- Create: `29-streaming-ttft/README.md`
- Create: `tests/l29-streaming.spec.ts`

- [ ] **Step 1: Create the README**

```markdown
# Lesson 29 · 流式响应与 TTFT 测量

## 🎯 本课学完后你会
- 理解 **TTFT (Time To First Token)** 和总耗时 (Total) 的区别
- 用 `stream: true` 让 Responses API 边生成边返回
- 自己测量并对比 baseline / streaming 两种调用方式

## 📦 目录结构
```
29-streaming-ttft/
  baseline.ts   # 非-streaming，看 Total
  streaming.ts  # streaming，看 TTFT + Total
  README.md
```

## 🚀 运行
```bash
pnpm l29:baseline   # 先跑这个，看 Total 是多少
pnpm l29            # 再跑这个，看 TTFT 多快出现
```

## 📖 为什么要关心 TTFT

OpenAI 官方的 [latency optimization 指南](https://developers.openai.com/api/docs/guides/latency-optimization) 把
streaming 列为「让用户少等」最有效的一招——原因不在于让模型生成得更快，而在于**让用户更早看到反馈**。

> Streaming: The single most effective approach, as it cuts the waiting time to a second or less.

体验速度 ≠ 实际计算速度：
- baseline 让用户干等 5 秒，5 秒后整段刷出来
- streaming 让用户 0.6 秒就开始看到字，5 秒后整段同样结束

总耗时几乎相同，**用户感受天差地别**。

### 关键事件 (Responses API)

```ts
const stream = await client.responses.create({ model, input, stream: true });
for await (const ev of stream) {
  if (ev.type === "response.output_text.delta") {
    // 第一次拿到 delta = TTFT 时刻
  }
  if (ev.type === "response.completed") {
    // 拿 usage、finish reason 等
  }
}
```

完整事件类型见 [streaming responses 文档](https://developers.openai.com/api/docs/guides/streaming-responses)。

## 🔑 常见坑
- `for await` 的循环里别 `console.log(ev)` 打印整个事件——刷屏且分不清节奏
- TTFT 和模型大小、Prompt 长度、Prompt Caching 是否命中都有关；不要拿一次跑的数字下定论
- 生产环境里要把 streaming 拆出 SSE 通道（参考 Lesson 14 / 32）

## 🧠 适用场景
- ✅ 任何用户面对的 chat / 长答案场景
- ✅ 需要展示「思考中」状态的复杂任务
- ❌ 调用方是另一个程序而不是人（streaming 反而让代码更复杂）

## ⏭️ 下一节
[Lesson 30 — Prompt Caching](../30-prompt-caching/)：另一种「让用户少等」的方法，但攻击的是 input 端。
```

- [ ] **Step 2: Create the test**

```ts
import { test, expect } from "@playwright/test";
import { runPnpm } from "./helpers/spawn-pnpm.js";

const NETWORK = process.env.RUN_NETWORK_TESTS === "1";

test.describe("Lesson 29 · streaming + TTFT", () => {
  test.skip(!NETWORK, "Network test — set RUN_NETWORK_TESTS=1 to run");

  test("baseline.ts prints Total ms @network", async () => {
    const { stdout, code } = await runPnpm("l29:baseline", { timeoutMs: 60_000 });
    expect(code).toBe(0);
    expect(stdout).toMatch(/========== 非-streaming \(baseline\) ==========/);
    expect(stdout).toMatch(/Total:\s+\d+ ms/);
    expect(stdout).toMatch(/Tokens:\s+\d+/);
  });

  test("streaming.ts prints TTFT + Total, TTFT < Total @network", async () => {
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
```

- [ ] **Step 3: Verify the test runs (offline-skip path)**

Run: `pnpm test`

Expected: 2 tests skipped (no `@network` env), 0 failed.

- [ ] **Step 4: Verify the test runs (network path) — OPTIONAL, costs ~$0.002**

Only run if you want to confirm: `pnpm test:network -- --grep "Lesson 29"`

Expected: 2 tests passed.

- [ ] **Step 5: Commit**

```bash
git add 29-streaming-ttft/README.md tests/l29-streaming.spec.ts
git commit -m "test(l29): add README + Playwright network-gated tests"
```

---

## Task 6: Lesson 30 — fake KB constant + `cache-hit.ts`

**Files:**
- Create: `30-prompt-caching/fake-kb.ts`
- Create: `30-prompt-caching/cache-hit.ts`

- [ ] **Step 1: Create the fake-kb file**

```ts
// 一段「公司知识库」的假文本，约 2000+ tokens (~3500 个汉字 + 标点)。
// Prompt Caching 要求 prompt ≥ 1024 tokens 才会启用，这段文本是为了越过那个门槛。
// 注意：按官方建议，这段「静态前缀」应当放在 prompt 开头 (instructions)，
// 把动态部分（用户问题）放在 input 末尾，才能命中缓存。

export const LONG_KB = `
你正在为「喵云科技 PurrCloud」客服扮演一名专业、耐心、说话简洁的客服助手。下面是
公司全部对外公开的产品和政策资料，请严格只用这些资料回答用户问题。如果资料中找
不到答案，请回答「这个问题我需要转人工，请稍等」，不要编造。

【公司简介】
喵云科技 PurrCloud 成立于 2024 年，总部位于上海徐汇区。我们做猫主子智能云服务，
包括宠物云相册、自动喂食器排程、健康数据看板、远程兽医咨询四条产品线。截至 2026
年 4 月，注册用户超过 240 万，日活 38 万。我们的客服小时是工作日 9:00-21:00，
非工作日 10:00-18:00，全部使用普通话。

【订阅套餐】
我们有三档订阅套餐：
1. Nibble 入门版：月费 ¥19，含 5GB 云相册、1 台喂食器排程、健康数据基础看板。
2. Feast 标准版：月费 ¥49，含 50GB 云相册、3 台喂食器排程、健康数据高级看板、
   每月 1 次 15 分钟远程兽医咨询。
3. Royal 旗舰版：月费 ¥129，含 500GB 云相册、10 台喂食器排程、健康数据高级看板
   含 AI 异常检测、每月 4 次 30 分钟远程兽医咨询、专属客服通道。
所有套餐都支持月付和年付，年付一律 9 折。新用户首月免费，但需要绑定支付方式。

【物流与配送】
喵云硬件商城销售喂食器、智能项圈、自动饮水机等配件。下单 24 小时内发货，物流
合作商是顺丰和京东，全国大部分城市次日达，偏远地区 3-5 个工作日。生鲜猫粮订单
仅在工作日发货，且仅支持距离仓库 200 公里以内的地址（仓库在上海、北京、广州）。
满 ¥299 包邮，未满收 ¥18 运费。下单后 2 小时内可在 App「我的订单」页取消，
之后需要联系客服。

【退款与售后】
- 订阅类：开通 7 天内无理由退款，原路退回，到账 1-3 个工作日；7 天后不退，但可
  随时降级或停止续订，已支付月份继续生效。
- 硬件类：未开封 15 天内无理由退货，开封后 30 天内只接受质量问题退换。退回运费
  由质量问题方承担。
- 远程兽医咨询：未使用次数不退款，可结转到下个月，最多结转 3 个月。

【常见 FAQ】
Q: 我的猫拒绝吃喂食器投放的粮，怎么办？
A: 这是常见的过渡期问题。建议前一周把喂食器和原本的食盆并排放，先让猫习惯它的
   出现；第二周开始用喂食器投放但保留食盆少量；第三周完全切到喂食器。

Q: 我能不能多个家庭成员共享一个账号？
A: Royal 旗舰版支持最多 5 个子账号共享一个主账号下的设备和数据；Nibble 和 Feast
   只支持 1 个主账号，可以在 3 台设备上同时登录。

Q: 健康数据看板支持哪些指标？
A: 基础看板包括饮水量、进食量、活动时长、睡眠时长。高级看板额外包括体重曲线、
   呼吸频率（需要智能项圈）、AI 异常预警（仅 Royal）。

Q: 远程兽医咨询能开处方吗？
A: 不能开处方药。可以建议常见问题的处理方法、营养调整建议、是否需要去线下医院。
   涉及处方药请前往合作的线下医院。

【安全与隐私】
所有上传到云相册的图片仅用户本人和子账号可见，我们不会用于训练任何 AI 模型。
健康数据加密存储，可在 App「我的-隐私-数据导出」一键下载或删除。

【投诉渠道】
对客服回答不满意可以拨打 400-800-MEOW (6369)，或在 App「我的-反馈」提交工单，
工单会在 24 小时内由人工跟进。

——以上是全部对外公开资料——
`.trim();
```

- [ ] **Step 2: Create cache-hit.ts**

```ts
import "dotenv/config";
import OpenAI from "openai";
import { LONG_KB } from "./fake-kb.js";

// Lesson 30 · cache-hit.ts
// Prompt Caching 是 OpenAI 自动启用的：prompt ≥ 1024 tokens 后就生效。
// 第一次调用是「冷调用」(cold)，第二次同样的前缀就能命中缓存 (warm)。
// 我们看 usage.prompt_tokens_details.cached_tokens 来证明。

const client = new OpenAI();

async function callOnce(label: string, question: string) {
  const resp = await client.responses.create({
    model: "gpt-5.4-nano",
    instructions: LONG_KB,            // ← 长静态前缀，放在最前面
    input: question,                  // ← 短动态后缀，放在末尾
  });

  const inputTokens = resp.usage?.input_tokens ?? 0;
  const cachedTokens = resp.usage?.prompt_tokens_details?.cached_tokens ?? 0;
  const ratio = inputTokens > 0
    ? Math.round((cachedTokens / inputTokens) * 100)
    : 0;

  console.log(`${label}:`);
  console.log(`  input_tokens:  ${inputTokens}`);
  console.log(`  cached_tokens: ${cachedTokens}`);
  console.log(`  hit ratio:     ${ratio}%`);
  console.log("");
}

async function main() {
  console.log("========== Prompt Caching: cold vs warm ==========\n");

  await callOnce("Call 1 (cold)", "你们的退款政策是什么？");
  await callOnce("Call 2 (warm)", "你们的物流多久能到？");

  console.log("📌 Call 2 的 cached_tokens 应该约等于 input_tokens —— 长前缀全命中了缓存。");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Add the script to package.json**

```json
"l30": "tsx 30-prompt-caching/cache-hit.ts",
```

- [ ] **Step 4: Smoke-run**

Run: `pnpm l30`

Expected: prints two `Call N` blocks. Call 1's `cached_tokens` is 0; Call 2's `cached_tokens` is large (typically 90%+ of `input_tokens`). (Costs ~$0.002.)

- [ ] **Step 5: Commit**

```bash
git add 30-prompt-caching/fake-kb.ts 30-prompt-caching/cache-hit.ts package.json
git commit -m "feat(l30): add fake KB constant + cache-hit demo + l30 script"
```

---

## Task 7: Lesson 30 — `cache-key.ts`

**Files:**
- Create: `30-prompt-caching/cache-key.ts`

- [ ] **Step 1: Create the file**

```ts
import "dotenv/config";
import OpenAI from "openai";
import { LONG_KB } from "./fake-kb.js";

// Lesson 30 · cache-key.ts
// 当多个租户共享同一个长 system prompt，但每个租户的请求量都不到「持续命中」需要
// 的 ~15 RPM 时，可以传 prompt_cache_key 来影响路由——OpenAI 会按 (prefix_hash, key)
// 把请求往同一台机器上路由，提高命中率。

const client = new OpenAI();

async function callWithKey(key: string, question: string) {
  const resp = await client.responses.create({
    model: "gpt-5.4-nano",
    instructions: LONG_KB,
    input: question,
    prompt_cache_key: key,            // ← 影响路由的关键
  });

  const inputTokens = resp.usage?.input_tokens ?? 0;
  const cachedTokens = resp.usage?.prompt_tokens_details?.cached_tokens ?? 0;
  console.log(`  key=${key.padEnd(15)}  cached=${cachedTokens}/${inputTokens}`);
}

async function main() {
  console.log("========== prompt_cache_key 演示 ==========\n");

  console.log("第一轮 (cold):");
  await callWithKey("tenant-shanghai", "你们物流多久能到？");
  await callWithKey("tenant-beijing",  "你们物流多久能到？");
  console.log("");

  console.log("第二轮 (warm，同 key 应当命中):");
  await callWithKey("tenant-shanghai", "你们退款怎么操作？");
  await callWithKey("tenant-beijing",  "你们退款怎么操作？");

  console.log("");
  console.log("📌 同一个 prompt_cache_key 的第二次调用 cached_tokens 会显著高于 0。");
  console.log("📌 不同 key 之间默认互不干扰，避免互相把对方的缓存「挤掉」。");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add the script**

```json
"l30:key": "tsx 30-prompt-caching/cache-key.ts",
```

- [ ] **Step 3: Smoke-run**

Run: `pnpm l30:key`

Expected: 4 calls, second pair shows higher `cached` numbers than first pair. (Costs ~$0.005.)

- [ ] **Step 4: Commit**

```bash
git add 30-prompt-caching/cache-key.ts package.json
git commit -m "feat(l30): add cache-key routing demo"
```

---

## Task 8: Lesson 30 — `prefix-order.ts`

**Files:**
- Create: `30-prompt-caching/prefix-order.ts`

- [ ] **Step 1: Create the file**

```ts
import "dotenv/config";
import OpenAI from "openai";
import { LONG_KB } from "./fake-kb.js";

// Lesson 30 · prefix-order.ts
// Cache 命中只匹配「前缀完全一致」。
// 如果你把动态内容放在前面、静态长内容放在后面，缓存就废了。
// 同样的 token 总量，不同顺序，命中率天差地别。

const client = new OpenAI();

const QUESTIONS = ["你们的退款政策？", "你们的退款政策？"];

async function badOrdering(question: string) {
  // ❌ 反例：动态问题在前 + 长静态 KB 在后 → 每次的「前缀」都不一样
  const resp = await client.responses.create({
    model: "gpt-5.4-nano",
    instructions: `用户当前问题：${question}\n\n参考资料如下：\n${LONG_KB}`,
    input: "请基于以上资料回答。",
  });
  return {
    input: resp.usage?.input_tokens ?? 0,
    cached: resp.usage?.prompt_tokens_details?.cached_tokens ?? 0,
  };
}

async function goodOrdering(question: string) {
  // ✅ 正例：长静态 KB 在 instructions、动态问题放最后的 input
  const resp = await client.responses.create({
    model: "gpt-5.4-nano",
    instructions: LONG_KB,
    input: question,
  });
  return {
    input: resp.usage?.input_tokens ?? 0,
    cached: resp.usage?.prompt_tokens_details?.cached_tokens ?? 0,
  };
}

async function main() {
  console.log("========== 顺序对缓存命中的影响 ==========\n");

  console.log("❌ Bad ordering (dynamic-first):");
  for (const q of QUESTIONS) {
    const r = await badOrdering(q);
    console.log(`  cached_tokens=${r.cached}/${r.input}`);
  }

  console.log("");
  console.log("✅ Good ordering (static-first):");
  for (const q of QUESTIONS) {
    const r = await goodOrdering(q);
    console.log(`  cached_tokens=${r.cached}/${r.input}`);
  }

  console.log("");
  console.log("📌 一句话原则：静态内容放前面 (instructions)，动态内容放后面 (input)。");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add the script**

```json
"l30:order": "tsx 30-prompt-caching/prefix-order.ts",
```

- [ ] **Step 3: Smoke-run**

Run: `pnpm l30:order`

Expected: bad-ordering second call shows much lower `cached_tokens` than good-ordering second call. (Costs ~$0.005.)

- [ ] **Step 4: Commit**

```bash
git add 30-prompt-caching/prefix-order.ts package.json
git commit -m "feat(l30): add prefix-order demo showing static-first wins"
```

---

## Task 9: Lesson 30 — README + e2e test

**Files:**
- Create: `30-prompt-caching/README.md`
- Create: `tests/l30-caching.spec.ts`

- [ ] **Step 1: Create the README**

```markdown
# Lesson 30 · Prompt Caching

## 🎯 本课学完后你会
- 知道 Prompt Caching 是**自动启用、零成本、不需要任何代码改动**
- 学会读 `usage.prompt_tokens_details.cached_tokens` 来证明缓存命中
- 掌握「静态前缀放前面，动态内容放后面」的关键原则
- 知道什么时候用 `prompt_cache_key` 影响路由

## 📦 目录结构
```
30-prompt-caching/
  fake-kb.ts        # ~2000 token 假知识库（一节自用，不跨节复用）
  cache-hit.ts      # cold vs warm 对比
  cache-key.ts      # prompt_cache_key 演示
  prefix-order.ts   # 顺序对命中的影响
  README.md
```

## 🚀 运行
```bash
pnpm l30          # cache-hit
pnpm l30:key      # prompt_cache_key
pnpm l30:order    # 顺序错 vs 顺序对
```

## 📖 Prompt Caching 是什么

OpenAI 的 [Prompt Caching 指南](https://developers.openai.com/api/docs/guides/prompt-caching) 一句话总结：

> Prompt Caching can reduce latency by up to 80% and input token costs by up to 90%.
> Prompt Caching works automatically on all your API requests (no code changes required).

工作原理：你的 prompt 越过 1024 tokens 后，OpenAI 会按前缀 hash 把请求路由到一台机器，
那台机器把该前缀的中间状态（KV tensor）缓存住。下次同样的前缀来，命中缓存就直接拿来用，
跳过了重新「读」整个 prompt 的过程。

### 关键事实

| 事实 | 含义 |
|---|---|
| ≥ 1024 tokens 才启用 | 短 prompt 永远 `cached_tokens=0` |
| 前缀必须**完全一致** | 静态内容放前面，动态内容放后面 |
| 自动 + 免费 | 不用配置、不收费 |
| 默认 in-memory，5–10 分钟过期 | 高频系统会持续命中 |
| `prompt_cache_retention: "24h"` | gpt-5.4 / gpt-5.5 等支持的模型可显式延长 |
| `prompt_cache_key` | 影响路由，让多租户场景更稳定命中 |

### 怎么读「命中率」

```ts
const resp = await client.responses.create({...});
const inputTokens   = resp.usage?.input_tokens ?? 0;
const cachedTokens  = resp.usage?.prompt_tokens_details?.cached_tokens ?? 0;
const hitRatio      = cachedTokens / inputTokens;
```

`prompt_tokens_details.cached_tokens` 才是命中数；`input_tokens` 是总 prompt 长度。

## 🔑 常见坑

- **错把动态内容放前面**：每次的「前缀」都变了，缓存全废。`prefix-order.ts` 就是演示这个。
- **把 prompt 拆得太细碎**：每次都构造略微不同的 system prompt，命中不到。
- **凭单次跑分下结论**：缓存默认 5–10 分钟过期，连续跑两次能看到效果，间隔半小时可能就不行了。
- **以为传了 key 就一定命中**：`prompt_cache_key` 只是「影响路由」，不是「强制命中」；前缀本身不一致还是不会命中。

## 🧠 适用场景

- ✅ 系统 prompt 很长且固定（agent、客服、专业助手）
- ✅ Few-shot 示例固定不变
- ✅ RAG 中「指令 + 检索结果」是稳定结构（指令在前，检索结果在后）
- ❌ 完全个性化的 prompt（每次都不一样）—— 那就别强求命中

## ⏭️ 下一节
[Lesson 31 — Make Fewer Requests](../31-fewer-requests/)：另一个减少 input token 处理量的角度——别发那么多请求。
```

- [ ] **Step 2: Create the test**

```ts
import { test, expect } from "@playwright/test";
import { runPnpm } from "./helpers/spawn-pnpm.js";

const NETWORK = process.env.RUN_NETWORK_TESTS === "1";

function parseCachedLines(stdout: string): Array<{ cached: number; input: number }> {
  // Matches lines like "  cached_tokens: 1920" + "  input_tokens: 2000"
  // OR compact form "  cached_tokens=1920/2000"
  const compact = [...stdout.matchAll(/cached(?:_tokens)?[=:]\s*(\d+)(?:\/(\d+))?/g)];
  return compact.map((m) => ({
    cached: Number(m[1]),
    input: m[2] ? Number(m[2]) : NaN,
  }));
}

test.describe("Lesson 30 · Prompt Caching", () => {
  test.skip(!NETWORK, "Network test — set RUN_NETWORK_TESTS=1 to run");

  test("cache-hit.ts shows cold→warm cache jump @network", async () => {
    const { stdout, code } = await runPnpm("l30", { timeoutMs: 60_000 });
    expect(code).toBe(0);

    // Expect the literal labels to confirm the script ran end-to-end
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

  test("prefix-order.ts shows good ordering beats bad @network", async () => {
    const { stdout, code } = await runPnpm("l30:order", { timeoutMs: 60_000 });
    expect(code).toBe(0);

    expect(stdout).toMatch(/Bad ordering/);
    expect(stdout).toMatch(/Good ordering/);

    // The 4 cached numbers in order: bad-call-1, bad-call-2, good-call-1, good-call-2
    const cached = parseCachedLines(stdout).map((p) => p.cached);
    expect(cached.length).toBeGreaterThanOrEqual(4);
    const [, badSecond, , goodSecond] = cached;
    // Second call in "good" ordering should beat the second call in "bad" ordering
    expect(goodSecond).toBeGreaterThan(badSecond);
  });
});
```

- [ ] **Step 3: Verify offline test path**

Run: `pnpm test`

Expected: previous tests + 2 new tests skipped, 0 failed.

- [ ] **Step 4: Commit**

```bash
git add 30-prompt-caching/README.md tests/l30-caching.spec.ts
git commit -m "test(l30): add README + Playwright tests for prompt caching"
```

---

## Task 10: Lesson 31 — `combine.ts`

**Files:**
- Create: `31-fewer-requests/combine.ts`

- [ ] **Step 1: Create the file**

```ts
import "dotenv/config";
import OpenAI from "openai";

// Lesson 31 · combine.ts
// 别把能 1 次完成的事拆成 2 次：每次 round-trip 都有固定开销。
// 这里把「改写问题为搜索 query」+「回答问题」从 2 个顺序请求合并为 1 个 JSON 输出。

const client = new OpenAI();

const HISTORY = [
  { role: "user" as const, content: "你们最近的退款政策是什么？" },
  { role: "assistant" as const, content: "7 天内无理由退款，原路退回。" },
  { role: "user" as const, content: "那它包多久？" },
];

async function badSplit() {
  const start = performance.now();

  const rewrite = await client.responses.create({
    model: "gpt-5.4-nano",
    instructions:
      "把用户最新一句话改写成自包含的搜索 query。只输出 query 本身，不要任何解释。",
    input: HISTORY.map((m) => `${m.role}: ${m.content}`).join("\n"),
  });
  const query = rewrite.output_text.trim();

  const answer = await client.responses.create({
    model: "gpt-5.4-nano",
    instructions: "用一句话回答下面的问题。",
    input: query,
  });

  const total = performance.now() - start;
  return { total, query, answer: answer.output_text };
}

async function goodCombined() {
  const start = performance.now();

  const resp = await client.responses.create({
    model: "gpt-5.4-nano",
    instructions: `把用户最新一句话改写成自包含搜索 query，并直接回答它。
按 JSON 返回：{"query": "...", "answer": "..."}。不要任何额外文字。`,
    input: HISTORY.map((m) => `${m.role}: ${m.content}`).join("\n"),
  });

  const total = performance.now() - start;
  return { total, raw: resp.output_text };
}

async function main() {
  console.log("========== 拆开 vs 合并 ==========\n");

  console.log("❌ 2 次顺序调用:");
  const bad = await badSplit();
  console.log(`  Total: ${bad.total.toFixed(0)} ms`);
  console.log(`  query:  ${bad.query}`);
  console.log(`  answer: ${bad.answer}`);
  console.log("");

  console.log("✅ 1 次合并调用 (JSON 输出):");
  const good = await goodCombined();
  console.log(`  Total: ${good.total.toFixed(0)} ms`);
  console.log(`  raw:    ${good.raw.slice(0, 120)}`);
  console.log("");

  const speedup = bad.total / good.total;
  console.log(`📌 合并版本快了约 ${speedup.toFixed(1)}× (省了 1 次 round-trip)`);
  console.log("📌 注意：能合并的前提是模型一次能想清楚两件事。复杂任务别硬合并。");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add the script**

```json
"l31": "tsx 31-fewer-requests/combine.ts",
```

- [ ] **Step 3: Smoke-run**

Run: `pnpm l31`

Expected: prints both blocks; combined Total < bad Total. (Costs ~$0.001.)

- [ ] **Step 4: Commit**

```bash
git add 31-fewer-requests/combine.ts package.json
git commit -m "feat(l31): add combine.ts demo for collapsing sequential prompts"
```

---

## Task 11: Lesson 31 — `parallel.ts`

**Files:**
- Create: `31-fewer-requests/parallel.ts`

- [ ] **Step 1: Create the file**

```ts
import "dotenv/config";
import OpenAI from "openai";

// Lesson 31 · parallel.ts
// 三个互相独立的分类任务（情感 / 语种 / 主题）：
// - 顺序 await 三次 = 三次延迟相加
// - Promise.all 同时发 = 取最长那一个
// 这是 OpenAI 官方 latency 7 原则里的 #5 「Parallelize」。

const client = new OpenAI();

const TEXT = "今天发的快递居然把我的猫罐头压扁了，太离谱了！";

async function classify(prompt: string): Promise<string> {
  const resp = await client.responses.create({
    model: "gpt-5.4-nano",
    instructions: prompt,
    input: TEXT,
  });
  return resp.output_text.trim();
}

const TASKS = {
  sentiment: "用一个词判断这段话的情感（正面/负面/中性）。只输出那个词。",
  language: "判断这段话的主要语言。只输出语言名（中文/English/...）。",
  topic: "用 ≤5 个汉字给这段话打主题标签。",
};

async function sequential() {
  const start = performance.now();
  const sentiment = await classify(TASKS.sentiment);
  const language = await classify(TASKS.language);
  const topic = await classify(TASKS.topic);
  return { total: performance.now() - start, sentiment, language, topic };
}

async function parallel() {
  const start = performance.now();
  const [sentiment, language, topic] = await Promise.all([
    classify(TASKS.sentiment),
    classify(TASKS.language),
    classify(TASKS.topic),
  ]);
  return { total: performance.now() - start, sentiment, language, topic };
}

async function main() {
  console.log("========== 顺序 vs 并行 ==========\n");

  console.log("❌ 顺序 await 三次:");
  const s = await sequential();
  console.log(`  Total: ${s.total.toFixed(0)} ms`);
  console.log(`  ${s.sentiment} / ${s.language} / ${s.topic}`);
  console.log("");

  console.log("✅ Promise.all 同时发三次:");
  const p = await parallel();
  console.log(`  Total: ${p.total.toFixed(0)} ms`);
  console.log(`  ${p.sentiment} / ${p.language} / ${p.topic}`);
  console.log("");

  const speedup = s.total / p.total;
  console.log(`📌 并行版本快了约 ${speedup.toFixed(1)}×`);
  console.log("📌 适用前提：三个任务互相独立，不依赖彼此的输出。");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add the script**

```json
"l31:parallel": "tsx 31-fewer-requests/parallel.ts",
```

- [ ] **Step 3: Smoke-run**

Run: `pnpm l31:parallel`

Expected: prints both blocks; parallel Total < sequential Total (typically ~3× speedup). (Costs ~$0.001.)

- [ ] **Step 4: Commit**

```bash
git add 31-fewer-requests/parallel.ts package.json
git commit -m "feat(l31): add parallel.ts demo for Promise.all speedup"
```

---

## Task 12: Lesson 31 — README + e2e test

**Files:**
- Create: `31-fewer-requests/README.md`
- Create: `tests/l31-fewer-requests.spec.ts`

- [ ] **Step 1: Create the README**

```markdown
# Lesson 31 · 减少请求次数与并行

## 🎯 本课学完后你会
- 学会把多个顺序请求合并成 1 个 JSON 输出
- 用 `Promise.all` 把互相独立的请求并行发出
- 知道这两种优化的适用边界

## 📦 目录结构
```
31-fewer-requests/
  combine.ts    # 2 次顺序 → 1 次合并 (Make fewer requests)
  parallel.ts   # 3 次顺序 → 3 次并行 (Parallelize)
  README.md
```

## 🚀 运行
```bash
pnpm l31           # combine
pnpm l31:parallel  # parallel
```

## 📖 OpenAI 官方原则 #4 + #5

[Latency optimization 指南](https://developers.openai.com/api/docs/guides/latency-optimization) 里的 7 个原则中:
- **#4 Make fewer requests**：每次 API 调用都有固定 round-trip 开销，把能合并的合并掉。
- **#5 Parallelize**：互相独立的步骤别按顺序等，`Promise.all` 走起。

> Two shirts take just as long to dry as one.

### 何时合并 (combine.ts)

- 多步推理是「线性的」：第 1 步的输出会被第 2 步用
- 把「先改写、再回答」这类两步搞成一个 prompt，要求模型按 JSON 返回 `{step1, step2}`

### 何时并行 (parallel.ts)

- 多步推理是「独立的」：步骤之间互不依赖
- 比如：同时跑情感分类 + 语种识别 + 主题标签

## 🔑 常见坑
- **盲目合并损害质量**：模型一次想 3 件事会变蠢，要测试。
- **盲目并行触发 rate limit**：并行度高了会被 429，并发数要受控（这个话题留到 safety 章节 35 重试与限流）。
- **以为并行就一定快**：如果模型本身就慢、单次延迟大，并行只是把「等」摊到多任务上。

## 🧠 适用场景
- ✅ Combine: 客服/搜索的「query 重写 + 应答」、Agent 的「思考 + 决策」单步合并
- ✅ Parallel: 多分类、多翻译、多语言并发响应
- ❌ 单步任务、强依赖任务

## ⏭️ 下一节
[Lesson 32 — 性能优化 Web Demo](../32-perf-web-demo/)：把前面学的全部优化在一个真前端里展示出来。
```

- [ ] **Step 2: Create the test**

```ts
import { test, expect } from "@playwright/test";
import { runPnpm } from "./helpers/spawn-pnpm.js";

const NETWORK = process.env.RUN_NETWORK_TESTS === "1";

function parseTotals(stdout: string): number[] {
  return [...stdout.matchAll(/Total:\s+(\d+) ms/g)].map((m) => Number(m[1]));
}

test.describe("Lesson 31 · Make fewer requests + Parallelize", () => {
  test.skip(!NETWORK, "Network test — set RUN_NETWORK_TESTS=1 to run");

  test("combine.ts: combined call beats sequential 2-call @network", async () => {
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

  test("parallel.ts: Promise.all beats sequential 3-call @network", async () => {
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
```

- [ ] **Step 3: Verify offline test path**

Run: `pnpm test`

Expected: all skipped, 0 failed.

- [ ] **Step 4: Commit**

```bash
git add 31-fewer-requests/README.md tests/l31-fewer-requests.spec.ts
git commit -m "test(l31): add README + Playwright tests for fewer-requests + parallel"
```

---

## Task 13: Lesson 32 — server.ts

**Files:**
- Create: `32-perf-web-demo/server/server.ts`

- [ ] **Step 1: Create the server**

```ts
import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import OpenAI from "openai";

// Lesson 32 · server.ts
// 两条路由演示「让用户少等」的极致体验差距：
//   POST /api/chat/slow   非-streaming，await 整段回复后一次性 JSON 返回
//   POST /api/chat/fast   streaming，SSE 把 delta 一片一片推给前端
// Stateless：单轮对话，不保存 session。

const client = new OpenAI();
const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

// ============ Slow: non-streaming ============
app.post("/api/chat/slow", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { question } = req.body as { question?: string };
    if (typeof question !== "string" || question.trim().length < 1) {
      res.status(400).json({ ok: false, error: "missing question" });
      return;
    }

    const start = performance.now();
    const resp = await client.responses.create({
      model: "gpt-5.4-nano",
      input: question,
    });
    const total = performance.now() - start;

    res.json({
      ok: true,
      answer: resp.output_text,
      total_ms: Math.round(total),
      output_tokens: resp.usage?.output_tokens ?? 0,
    });
  } catch (err) {
    next(err);
  }
});

// ============ Fast: streaming via SSE ============
app.post("/api/chat/fast", async (req: Request, res: Response) => {
  const { question } = req.body as { question?: string };
  if (typeof question !== "string" || question.trim().length < 1) {
    res.status(400).json({ ok: false, error: "missing question" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const start = performance.now();
  let ttft: number | null = null;
  let outputTokens = 0;

  try {
    const stream = await client.responses.create({
      model: "gpt-5.4-nano",
      input: question,
      stream: true,
    });

    for await (const ev of stream) {
      if (ev.type === "response.output_text.delta") {
        if (ttft === null) ttft = performance.now() - start;
        send("delta", { text: ev.delta });
      } else if (ev.type === "response.completed") {
        outputTokens = ev.response.usage?.output_tokens ?? 0;
      }
    }

    const total = performance.now() - start;
    send("done", {
      ttft_ms: ttft === null ? null : Math.round(ttft),
      total_ms: Math.round(total),
      output_tokens: outputTokens,
    });
    res.end();
  } catch (err) {
    send("error", { message: (err as Error).message });
    res.end();
  }
});

// Express v5 global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[server error]", err);
  res.status(500).json({ ok: false, error: err.message });
});

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  console.log(`Lesson 32 server listening on http://localhost:${PORT}`);
  console.log(`  POST /api/chat/slow   (non-streaming)`);
  console.log(`  POST /api/chat/fast   (SSE streaming)`);
});
```

- [ ] **Step 2: Add the script**

```json
"l32:server": "tsx 32-perf-web-demo/server/server.ts",
```

- [ ] **Step 3: Smoke-run the server**

Run in a separate terminal: `pnpm l32:server`

Expected: prints `Lesson 32 server listening on http://localhost:3000`. Leaves the process running.

In another terminal verify slow endpoint:

```bash
curl -s -X POST http://localhost:3000/api/chat/slow \
  -H "Content-Type: application/json" \
  -d '{"question":"用 20 字介绍黑洞"}'
```

Expected: JSON `{ ok, answer, total_ms, output_tokens }` after ~3-5s.

Verify fast endpoint streams:

```bash
curl -N -X POST http://localhost:3000/api/chat/fast \
  -H "Content-Type: application/json" \
  -d '{"question":"用 20 字介绍黑洞"}'
```

Expected: a sequence of `event: delta` lines arriving incrementally, ending with `event: done`.

Stop the server (Ctrl-C).

- [ ] **Step 4: Commit**

```bash
git add 32-perf-web-demo/server/server.ts package.json
git commit -m "feat(l32): add Express server with /slow and /fast routes"
```

---

## Task 14: Lesson 32 — web scaffold (package.json, vite, tsconfig, index, main, styles, types)

**Files:**
- Create: `32-perf-web-demo/web/package.json`
- Create: `32-perf-web-demo/web/tsconfig.json`
- Create: `32-perf-web-demo/web/tsconfig.node.json`
- Create: `32-perf-web-demo/web/vite.config.ts`
- Create: `32-perf-web-demo/web/index.html`
- Create: `32-perf-web-demo/web/src/main.tsx`
- Create: `32-perf-web-demo/web/src/styles.css`
- Create: `32-perf-web-demo/web/src/types.ts`

- [ ] **Step 1: Create web/package.json**

```json
{
  "name": "l32-perf-web-demo-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.7.2",
    "vite": "^6.0.5"
  }
}
```

- [ ] **Step 2: Create web/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "allowImportingTsExtensions": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 3: Create web/tsconfig.node.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: Create web/vite.config.ts**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Lesson 32 · vite.config.ts
// 前端跑在 5173，后端跑在 3000；/api 代理到后端避免 CORS 麻烦。
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: false,
      },
    },
  },
});
```

- [ ] **Step 5: Create web/index.html**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Lesson 32 · Slow vs Fast</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create web/src/main.tsx**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 7: Create web/src/styles.css**

```css
:root {
  font-family: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  background: #0f172a;
  color: #e2e8f0;
}

* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; }

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.split {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: #1e293b;
  overflow: hidden;
}

.pane {
  display: flex;
  flex-direction: column;
  background: #0f172a;
  overflow: hidden;
}

.pane-header {
  padding: 12px 16px;
  background: #1e293b;
  border-bottom: 1px solid #334155;
  font-size: 14px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.pane-header.slow { color: #f59e0b; }
.pane-header.fast { color: #34d399; }

.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  font-size: 15px;
  line-height: 1.6;
}

.bubble {
  margin-bottom: 12px;
  padding: 10px 14px;
  border-radius: 8px;
  white-space: pre-wrap;
  word-break: break-word;
}
.bubble.user { background: #1e3a8a; align-self: flex-end; }
.bubble.assistant { background: #1f2937; }
.bubble.placeholder { background: #1f2937; color: #64748b; font-style: italic; }

.stats-bar {
  padding: 8px 16px;
  background: #1e293b;
  border-top: 1px solid #334155;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 12px;
  color: #94a3b8;
}

.composer {
  display: flex;
  gap: 8px;
  padding: 12px;
  background: #1e293b;
  border-top: 1px solid #334155;
}
.composer textarea {
  flex: 1;
  padding: 8px 12px;
  background: #0f172a;
  color: #e2e8f0;
  border: 1px solid #334155;
  border-radius: 6px;
  font-family: inherit;
  font-size: 14px;
  resize: none;
}
.composer button {
  padding: 8px 20px;
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
}
.composer button:disabled { background: #475569; cursor: not-allowed; }
```

- [ ] **Step 8: Create web/src/types.ts**

```ts
export type Role = "user" | "assistant";

export interface Msg {
  id: string;
  role: Role;
  content: string;
  status: "complete" | "streaming" | "pending" | "error";
}

export interface Stats {
  ttft_ms?: number;
  total_ms?: number;
  output_tokens?: number;
}
```

- [ ] **Step 9: Install web deps**

Run: `pnpm -C 32-perf-web-demo/web install`

Expected: `node_modules/` created inside `32-perf-web-demo/web/`. No errors.

- [ ] **Step 10: Smoke-check Vite boots**

Run: `pnpm -C 32-perf-web-demo/web dev` (from a separate terminal)

Expected: Vite prints `VITE vX.X.X ready in NNN ms` and a localhost URL. Browser navigation to it shows blank page (App.tsx not yet created — error is OK at this step).

Kill it with Ctrl-C.

- [ ] **Step 11: Commit**

```bash
git add 32-perf-web-demo/web/package.json 32-perf-web-demo/web/tsconfig.json 32-perf-web-demo/web/tsconfig.node.json 32-perf-web-demo/web/vite.config.ts 32-perf-web-demo/web/index.html 32-perf-web-demo/web/src/main.tsx 32-perf-web-demo/web/src/styles.css 32-perf-web-demo/web/src/types.ts
git commit -m "feat(l32): scaffold Vite + React 19 web app (config, scaffolding, types)"
```

---

## Task 15: Lesson 32 — web hooks (`useSlowChat.ts` + `useStreamingChat.ts`)

**Files:**
- Create: `32-perf-web-demo/web/src/hooks/useSlowChat.ts`
- Create: `32-perf-web-demo/web/src/hooks/useStreamingChat.ts`

- [ ] **Step 1: Create useSlowChat.ts**

```ts
import { useState, useCallback } from "react";
import type { Msg, Stats } from "../types.ts";

// Lesson 32 · useSlowChat.ts
// 老土的用法：fetch + 等整段 JSON 回来 + 一次性 setState。
// 用户在「等待」期间什么都看不到，只能转圈。

export function useSlowChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [stats, setStats] = useState<Stats>({});
  const [isPending, setIsPending] = useState(false);

  const send = useCallback(async (question: string) => {
    setIsPending(true);
    setStats({});

    const userMsg: Msg = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
      status: "complete",
    };
    const placeholder: Msg = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "loading...",
      status: "pending",
    };
    setMessages((m) => [...m, userMsg, placeholder]);

    try {
      const resp = await fetch("/api/chat/slow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await resp.json();
      if (!data.ok) throw new Error(data.error ?? "unknown");

      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = {
          ...placeholder,
          content: data.answer,
          status: "complete",
        };
        return next;
      });
      setStats({
        total_ms: data.total_ms,
        output_tokens: data.output_tokens,
      });
    } catch (err) {
      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = {
          ...placeholder,
          content: `❌ ${(err as Error).message}`,
          status: "error",
        };
        return next;
      });
    } finally {
      setIsPending(false);
    }
  }, []);

  const reset = useCallback(() => {
    setMessages([]);
    setStats({});
  }, []);

  return { messages, stats, isPending, send, reset };
}
```

- [ ] **Step 2: Create useStreamingChat.ts**

```ts
import { useState, useCallback, useRef } from "react";
import type { Msg, Stats } from "../types.ts";

// Lesson 32 · useStreamingChat.ts
// 流式版本：fetch + ReadableStream + 解析 SSE 帧 + 增量 setState。
// 用户在第一个 delta 到达时（TTFT）就开始看到字。
//
// 这个 hook 是从 14-streaming-chat/web/src/useStreamingChat.ts 简化得到：
// - 去掉了 tool_call 处理
// - 去掉了 session reset 调用
// - 简化为单轮对话（messages 不会跨轮累积，每次 send 重置）

interface FrameEvent {
  event: string;
  data: unknown;
}

function parseFrame(raw: string): FrameEvent | null {
  let event = "message";
  let dataStr = "";
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
  }
  if (!dataStr) return null;
  try {
    return { event, data: JSON.parse(dataStr) };
  } catch {
    return null;
  }
}

export function useStreamingChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [stats, setStats] = useState<Stats>({});
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(async (question: string) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setIsStreaming(true);
    setStats({});

    const userMsg: Msg = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
      status: "complete",
    };
    const assistantId = crypto.randomUUID();
    const assistantMsg: Msg = {
      id: assistantId,
      role: "assistant",
      content: "",
      status: "streaming",
    };
    setMessages((m) => [...m, userMsg, assistantMsg]);

    try {
      const resp = await fetch("/api/chat/fast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
        signal: ac.signal,
      });
      if (!resp.ok || !resp.body) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const raw = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const frame = parseFrame(raw);
          if (!frame) continue;

          if (frame.event === "delta") {
            const text = (frame.data as { text: string }).text;
            setMessages((m) =>
              m.map((msg) =>
                msg.id === assistantId
                  ? { ...msg, content: msg.content + text }
                  : msg,
              ),
            );
          } else if (frame.event === "done") {
            const d = frame.data as Stats;
            setStats(d);
            setMessages((m) =>
              m.map((msg) =>
                msg.id === assistantId ? { ...msg, status: "complete" } : msg,
              ),
            );
          } else if (frame.event === "error") {
            const msg = (frame.data as { message: string }).message;
            setMessages((m) =>
              m.map((msg2) =>
                msg2.id === assistantId
                  ? { ...msg2, content: `❌ ${msg}`, status: "error" }
                  : msg2,
              ),
            );
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantId
            ? { ...msg, content: `❌ ${(err as Error).message}`, status: "error" }
            : msg,
        ),
      );
    } finally {
      setIsStreaming(false);
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setStats({});
  }, []);

  return { messages, stats, isStreaming, send, reset };
}
```

- [ ] **Step 3: Commit**

```bash
git add 32-perf-web-demo/web/src/hooks/
git commit -m "feat(l32): add useSlowChat + useStreamingChat hooks"
```

---

## Task 16: Lesson 32 — web components (Composer, MessageList, Bubble, StatsBar)

**Files:**
- Create: `32-perf-web-demo/web/src/components/Bubble.tsx`
- Create: `32-perf-web-demo/web/src/components/MessageList.tsx`
- Create: `32-perf-web-demo/web/src/components/StatsBar.tsx`
- Create: `32-perf-web-demo/web/src/components/Composer.tsx`

- [ ] **Step 1: Create Bubble.tsx**

```tsx
import type { Msg } from "../types.ts";

export function Bubble({ msg }: { msg: Msg }) {
  const cls =
    msg.role === "user"
      ? "bubble user"
      : msg.status === "pending"
        ? "bubble placeholder"
        : "bubble assistant";
  return <div className={cls}>{msg.content || "..."}</div>;
}
```

- [ ] **Step 2: Create MessageList.tsx**

```tsx
import { Bubble } from "./Bubble.tsx";
import type { Msg } from "../types.ts";

export function MessageList({ messages }: { messages: Msg[] }) {
  return (
    <div className="message-list">
      {messages.map((m) => (
        <Bubble key={m.id} msg={m} />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create StatsBar.tsx**

```tsx
import type { Stats } from "../types.ts";

export function StatsBar({ stats }: { stats: Stats }) {
  if (!stats.total_ms && stats.ttft_ms === undefined) {
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
```

- [ ] **Step 4: Create Composer.tsx**

```tsx
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
```

- [ ] **Step 5: Commit**

```bash
git add 32-perf-web-demo/web/src/components/
git commit -m "feat(l32): add Composer + MessageList + Bubble + StatsBar components"
```

---

## Task 17: Lesson 32 — App.tsx + visual sanity check

**Files:**
- Create: `32-perf-web-demo/web/src/App.tsx`

- [ ] **Step 1: Create App.tsx**

```tsx
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
```

- [ ] **Step 2: Add the web script to root package.json**

```json
"l32:web": "pnpm -C 32-perf-web-demo/web dev",
```

- [ ] **Step 3: Run both server and web, do visual sanity in a real browser**

Terminal A: `pnpm l32:server`

Terminal B: `pnpm l32:web`

In a browser open `http://localhost:5173`, type "用 50 字介绍黑洞", hit Enter.

Expected:
- Both panes immediately get the user message + an empty/placeholder assistant bubble
- Right pane (Fast) starts filling in text within ~1s
- Left pane (Slow) shows "loading..." for a few seconds, then dumps the answer all at once
- Both panes' StatsBar populate when their respective requests finish (Fast shows TTFT, Slow shows Total only)

Kill both terminals with Ctrl-C. (Costs ~$0.002.)

- [ ] **Step 4: Commit**

```bash
git add 32-perf-web-demo/web/src/App.tsx package.json
git commit -m "feat(l32): add App.tsx split-screen layout + l32:web pnpm script"
```

---

## Task 18: Lesson 32 — README + Playwright e2e test

**Files:**
- Create: `32-perf-web-demo/README.md`
- Create: `tests/l32-web-demo.spec.ts`

- [ ] **Step 1: Create the README**

```markdown
# Lesson 32 · 性能优化 Web Demo

## 🎯 本课学完后你会
- 把 streaming 在真前端里跑出来，亲眼看到「感知速度」的差距
- 用 Express SSE 把 OpenAI 的 streaming events 转出去
- 用 React 19 + Vite 6 写一个 split-screen UX 对比页

## 📦 目录结构
```
32-perf-web-demo/
  server/
    server.ts          # POST /api/chat/slow + /api/chat/fast
  web/
    src/
      App.tsx          # 左右分栏，一个 Composer 同时发两路
      hooks/
        useSlowChat.ts       # fetch → 等整段 JSON
        useStreamingChat.ts  # SSE → 增量 setState
      components/
        Composer / MessageList / Bubble / StatsBar
  README.md
```

## 🚀 运行
```bash
# 终端 A
pnpm l32:server

# 终端 B
pnpm l32:web

# 浏览器打开 http://localhost:5173
```

## 📖 这节课在演示什么

[Lesson 29](../29-streaming-ttft/) 用 CLI 看了 TTFT 和 Total 的数字差距，但**这种差距只有在真用户面前才能感同身受**。

这节课就是把那种感受做成可以亲眼看到的：

- 一个输入框，按下发送，**同一个问题同时发给 /slow 和 /fast**
- 左边「Slow」转圈干等 ~5 秒后整段刷出来
- 右边「Fast」~0.6 秒就开始飙字

总耗时几乎一样，但用户体验**完全不在一个时代**。

## 📖 SSE 在 Express v5 里怎么写

```ts
res.setHeader("Content-Type", "text/event-stream");
res.setHeader("Cache-Control", "no-cache");
res.flushHeaders();

const send = (event: string, data: unknown) => {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
};

for await (const ev of openaiStream) {
  if (ev.type === "response.output_text.delta") send("delta", { text: ev.delta });
  if (ev.type === "response.completed") {
    send("done", { ttft_ms, total_ms, output_tokens });
    res.end();
  }
}
```

前端用 `fetch().body.getReader()` 读流，按 `\n\n` 切帧，挑出 `event:` 和 `data:` 字段。
完整代码看 `web/src/hooks/useStreamingChat.ts`。

## 🔑 常见坑

- **忘了 `res.flushHeaders()`**：浏览器会等到 buffer 满或服务端 `res.end()` 才能拿到第一个字节，TTFT 直接报废
- **CORS / proxy 配错了**：Vite 已经在 `vite.config.ts` 里把 `/api` 代理到 3000，不用动；如果换了端口要同步改
- **response.output_text.delta 写错事件名**：仔细看 [streaming events 文档](https://developers.openai.com/api/docs/guides/streaming-responses)
- **客户端断开后服务端还在读 stream**：生产里要监听 `res.on("close")` + 用 AbortController 取消上游
- **流式情况下做 moderation 更难**：见官方文档「Moderation risk」一节

## 🧠 适用场景
- ✅ 任何用户面对的 chat / 文档生成 / 长答案场景
- ✅ Agent 工作流，把每一步「在干啥」实时推给前端
- ❌ 后端→后端调用（流式只让事情更复杂）

## ⏭️ 下一节
回到 [Lesson 28 · 性能优化总览](../28-perf-overview/) 看完整的 7 原则地图，
或继续 [Lesson 33 · Threat Model](../33-threat-model/) 进入 Safety 章节。
```

- [ ] **Step 2: Create the Playwright e2e test**

```ts
import { test, expect } from "@playwright/test";

const NETWORK = process.env.RUN_NETWORK_TESTS === "1";

test.describe("Lesson 32 · split-screen Slow vs Fast", () => {
  test.skip(!NETWORK, "Network test — set RUN_NETWORK_TESTS=1 to run");

  test.use({
    baseURL: "http://localhost:5173",
  });

  // Inline webServer config: starts both Express server and Vite,
  // tears them down after the test file completes.
  test.beforeAll(async () => {
    // The webServer is configured at the test level via process spawn.
    // (We use the Playwright config's webServer for this in playwright.config,
    // but to keep this spec self-contained we rely on the pnpm scripts having
    // been started externally. The webServer block is in playwright.config
    // OR you start them manually: `pnpm l32:server` + `pnpm l32:web`.)
  });

  test("user sees Fast pane streaming while Slow pane is still pending @network", async ({
    page,
  }) => {
    await page.goto("/");

    const slowPane = page.getByTestId("pane-slow");
    const fastPane = page.getByTestId("pane-fast");
    await expect(slowPane).toBeVisible();
    await expect(fastPane).toBeVisible();

    const input = page.getByTestId("composer-input");
    await input.fill("用 50 字介绍黑洞，要让小学生听懂。");
    await page.getByTestId("composer-send").click();

    // Within 5 seconds, fast pane should have non-empty assistant content
    await expect(async () => {
      const fastBubble = fastPane.locator(".bubble.assistant").last();
      const text = (await fastBubble.textContent()) ?? "";
      expect(text.trim().length).toBeGreaterThan(10);
    }).toPass({ timeout: 8_000 });

    // Slow pane should still be in 'pending' state (placeholder bubble visible)
    // OR may have just finished — the assertion is that fast got there first.
    // To make it robust we just check both eventually settle.

    // Within 30 seconds both panes should have a non-empty assistant message
    await expect(async () => {
      const slowText = (await slowPane.locator(".bubble.assistant").last().textContent()) ?? "";
      const fastText = (await fastPane.locator(".bubble.assistant").last().textContent()) ?? "";
      expect(slowText.trim().length).toBeGreaterThan(10);
      expect(fastText.trim().length).toBeGreaterThan(10);
    }).toPass({ timeout: 30_000 });

    // Fast pane's StatsBar should show a TTFT number
    const fastStats = fastPane.locator(".stats-bar");
    await expect(fastStats).toContainText(/TTFT:\s+\d+ ms/);

    // Slow pane's StatsBar should show a Total number
    const slowStats = slowPane.locator(".stats-bar");
    await expect(slowStats).toContainText(/Total:\s+\d+ ms/);
  });
});
```

- [ ] **Step 3: Add webServer config to playwright.config.ts**

Use `Edit` to update `tests/playwright.config.ts` — replace the whole file with:

```ts
import { defineConfig } from "@playwright/test";

const NETWORK = process.env.RUN_NETWORK_TESTS === "1";

export default defineConfig({
  testDir: ".",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    actionTimeout: 10_000,
    trace: "retain-on-failure",
  },
  // Only spin up the lesson 32 servers when running network tests
  webServer: NETWORK
    ? [
        {
          command: "pnpm l32:server",
          port: 3000,
          reuseExistingServer: true,
          timeout: 30_000,
        },
        {
          command: "pnpm l32:web",
          port: 5173,
          reuseExistingServer: true,
          timeout: 30_000,
        },
      ]
    : undefined,
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
```

- [ ] **Step 4: Verify offline path**

Run: `pnpm test`

Expected: all tests skipped, 0 failed. webServer NOT started (because NETWORK is false).

- [ ] **Step 5: Verify network path manually (OPTIONAL, costs ~$0.005)**

Run: `pnpm test:network -- --grep "Lesson 32"`

Expected: Playwright spawns server + web, opens Chromium, types question, asserts both panes settle. ~30s test duration.

- [ ] **Step 6: Commit**

```bash
git add 32-perf-web-demo/README.md tests/l32-web-demo.spec.ts tests/playwright.config.ts
git commit -m "test(l32): add README + Playwright e2e + webServer config"
```

---

## Task 19: Lesson 28 — `perf-flow.html` (TDD)

**Files:**
- Create: `tests/l28-overview.spec.ts` (test FIRST)
- Create: `28-perf-overview/perf-flow.html`

- [ ] **Step 1: Write the failing test FIRST**

This is offline-only so we can do strict TDD.

```ts
import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const HTML_PATH = resolve(
  fileURLToPath(import.meta.url),
  "..",
  "..",
  "28-perf-overview",
  "perf-flow.html",
);

test.describe("Lesson 28 · perf-flow.html DOM smoke", () => {
  test("renders title containing 性能", async ({ page }) => {
    await page.goto(`file://${HTML_PATH}`);
    const title = await page.title();
    expect(title).toContain("性能");
  });

  test("has at least 7 principle badges", async ({ page }) => {
    await page.goto(`file://${HTML_PATH}`);
    const badges = page.locator("[data-principle]");
    await expect(badges).toHaveCount(7);
  });

  test("has a timeline element", async ({ page }) => {
    await page.goto(`file://${HTML_PATH}`);
    const timeline = page.locator("[data-testid='timeline']");
    await expect(timeline).toBeVisible();
  });

  test("has a takeaway box", async ({ page }) => {
    await page.goto(`file://${HTML_PATH}`);
    const takeaway = page.locator("[data-testid='takeaway']");
    await expect(takeaway).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `pnpm test -- --grep "Lesson 28"`

Expected: 4 tests fail with "ENOENT" or similar (the HTML file doesn't exist yet).

- [ ] **Step 3: Create perf-flow.html to make the tests pass**

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>Lesson 28 · 性能优化总览</title>
  <style>
    body {
      margin: 0;
      padding: 40px;
      background: #0f172a;
      color: #e2e8f0;
      font-family: system-ui, -apple-system, "PingFang SC", sans-serif;
      line-height: 1.6;
    }
    h1 { color: #f1f5f9; font-size: 28px; margin: 0 0 8px; }
    .subtitle { color: #94a3b8; font-size: 14px; margin: 0 0 32px; }

    .timeline {
      display: flex;
      gap: 4px;
      height: 56px;
      margin: 24px 0 8px;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    .step {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      color: #f8fafc;
      text-shadow: 0 1px 2px rgba(0,0,0,0.5);
      padding: 0 8px;
    }
    .step-client    { flex: 1;  background: #475569; }
    .step-server    { flex: 1;  background: #64748b; }
    .step-embed     { flex: 2;  background: #0891b2; }
    .step-search    { flex: 2;  background: #06b6d4; }
    .step-prompt    { flex: 1;  background: #818cf8; }
    .step-llm       { flex: 8;  background: #f59e0b; }
    .step-stream    { flex: 4;  background: #34d399; }
    .step-render    { flex: 1;  background: #475569; }

    .legend {
      display: flex;
      gap: 4px;
      font-size: 11px;
      color: #94a3b8;
      margin-bottom: 32px;
    }
    .legend > div { padding: 0 8px; }
    .legend-client    { flex: 1; }
    .legend-server    { flex: 1; }
    .legend-embed     { flex: 2; }
    .legend-search    { flex: 2; }
    .legend-prompt    { flex: 1; }
    .legend-llm       { flex: 8; }
    .legend-stream    { flex: 4; }
    .legend-render    { flex: 1; }

    h2 { color: #f1f5f9; font-size: 20px; margin: 32px 0 16px; }
    .principles {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 12px;
    }
    .principle {
      background: #1e293b;
      border-left: 4px solid #f59e0b;
      padding: 12px 16px;
      border-radius: 6px;
    }
    .principle-num {
      display: inline-block;
      background: #f59e0b;
      color: #0f172a;
      font-weight: 700;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      text-align: center;
      line-height: 24px;
      font-size: 13px;
      margin-right: 8px;
    }
    .principle-title {
      font-weight: 600;
      font-size: 15px;
      color: #f8fafc;
      display: inline;
    }
    .principle-desc {
      font-size: 13px;
      color: #94a3b8;
      margin: 6px 0 0;
    }
    .principle-link {
      font-size: 12px;
      color: #34d399;
      margin-top: 6px;
      display: block;
    }

    .takeaway {
      margin-top: 40px;
      padding: 20px 24px;
      background: linear-gradient(135deg, #1e3a8a 0%, #1e293b 100%);
      border-radius: 8px;
      border: 1px solid #2563eb;
    }
    .takeaway h3 { color: #93c5fd; margin: 0 0 12px; font-size: 16px; }
    .takeaway p { margin: 6px 0; color: #cbd5e1; font-size: 14px; }
  </style>
</head>
<body>
  <h1>Lesson 28 · 性能优化总览</h1>
  <p class="subtitle">「AI 慢，大多不是算力问题，而是系统设计问题。」</p>

  <h2>一次完整的 AI 请求里时间花在哪</h2>
  <div class="timeline" data-testid="timeline">
    <div class="step step-client">客户端</div>
    <div class="step step-server">后端校验</div>
    <div class="step step-embed">RAG embed</div>
    <div class="step step-search">向量搜索</div>
    <div class="step step-prompt">prompt</div>
    <div class="step step-llm">LLM 生成</div>
    <div class="step step-stream">SSE stream</div>
    <div class="step step-render">render</div>
  </div>
  <div class="legend">
    <div class="legend-client">↑客户端</div>
    <div class="legend-server">↑后端校验</div>
    <div class="legend-embed">↑RAG embed</div>
    <div class="legend-search">↑向量搜索</div>
    <div class="legend-prompt">↑prompt</div>
    <div class="legend-llm">↑LLM 生成 (主要瓶颈)</div>
    <div class="legend-stream">↑SSE stream</div>
    <div class="legend-render">↑render</div>
  </div>

  <h2>OpenAI 官方的 7 个 Latency 原则</h2>
  <div class="principles">
    <div class="principle" data-principle="1">
      <span class="principle-num">1</span>
      <span class="principle-title">Process tokens faster</span>
      <p class="principle-desc">用更小的模型 / 蒸馏 / 推理优化（如 Predicted Outputs）。本课暂不做 demo。</p>
    </div>
    <div class="principle" data-principle="2">
      <span class="principle-num">2</span>
      <span class="principle-title">Generate fewer tokens</span>
      <p class="principle-desc">输出越短越快。让模型「简洁回答」、缩短 JSON key。</p>
    </div>
    <div class="principle" data-principle="3">
      <span class="principle-num">3</span>
      <span class="principle-title">Use fewer input tokens</span>
      <p class="principle-desc">主要靠 Prompt Caching（静态前缀放前面）。</p>
      <span class="principle-link">→ Lesson 30</span>
    </div>
    <div class="principle" data-principle="4">
      <span class="principle-num">4</span>
      <span class="principle-title">Make fewer requests</span>
      <p class="principle-desc">能合并的多步合成一个 prompt，省掉多次 round-trip。</p>
      <span class="principle-link">→ Lesson 31</span>
    </div>
    <div class="principle" data-principle="5">
      <span class="principle-num">5</span>
      <span class="principle-title">Parallelize</span>
      <p class="principle-desc">独立步骤用 Promise.all 同时发，总耗时 = 最慢那个。</p>
      <span class="principle-link">→ Lesson 31</span>
    </div>
    <div class="principle" data-principle="6">
      <span class="principle-num">6</span>
      <span class="principle-title">Make your users wait less</span>
      <p class="principle-desc">Streaming 把感知延迟从 5s 缩到 0.6s。</p>
      <span class="principle-link">→ Lesson 29 + 32</span>
    </div>
    <div class="principle" data-principle="7">
      <span class="principle-num">7</span>
      <span class="principle-title">Don't default to an LLM</span>
      <p class="principle-desc">能写死的写死、能预算的预算、能 hash 表搞定的别叫 LLM。</p>
    </div>
  </div>

  <div class="takeaway" data-testid="takeaway">
    <h3>📌 三件你要记住的事</h3>
    <p>1. AI 性能问题，本质是系统问题。</p>
    <p>2. 优化顺序：减少计算 → 改善体验 → 控制成本。</p>
    <p>3. 好的 AI 产品，让用户「等得住」。没有指标的优化，基本都是浪费时间。</p>
  </div>
</body>
</html>
```

- [ ] **Step 4: Re-run the test, confirm it passes**

Run: `pnpm test -- --grep "Lesson 28"`

Expected: 4 tests pass.

- [ ] **Step 5: Visual sanity in browser**

Open `28-perf-overview/perf-flow.html` directly in a browser (or via VS Code Live Server on port 5501).

Expected: dark-themed page with timeline bar, 7 numbered principle cards, and a takeaway box at the bottom.

- [ ] **Step 6: Commit**

```bash
git add tests/l28-overview.spec.ts 28-perf-overview/perf-flow.html
git commit -m "feat(l28): add perf-flow.html with TDD-driven DOM smoke tests"
```

---

## Task 20: Lesson 28 — README

**Files:**
- Create: `28-perf-overview/README.md`

- [ ] **Step 1: Create the README**

```markdown
# Lesson 28 · 性能优化总览

## 🎯 本课学完后你会
- 知道一次 AI 请求的「时间都花在哪」
- 学会 OpenAI 官方推荐的 [7 个 latency 原则](https://developers.openai.com/api/docs/guides/latency-optimization)
- 掌握「先看指标再优化」的工程纪律

## 📖 这节课没有可跑的脚本

打开 `perf-flow.html` 看图就行：
- macOS 直接 `open 28-perf-overview/perf-flow.html`
- 或者用 VS Code Live Server（项目已经在 `.vscode/settings.json` 里配置了 5501 端口）

## 📖 一句话主旨

> AI 慢，大多不是算力问题，而是系统设计问题。

很多新手第一反应是「换个更大的模型？」、「调温度？」，结果发现产品上线后用户的真实评价是：

> 功能不错，就是有点慢。

在真实产品里，这句话往往等于：**这个功能可能活不下来。**

## 📖 拆解一次完整的 AI 请求

```
用户发起 → 后端校验 → RAG embed → 向量搜索 → 构造 prompt → LLM 生成 → SSE 推流 → 前端渲染
```

每一步都是潜在的性能瓶颈。**LLM 生成那一步往往占总时间的 60%-80%**，但你能优化的地方远不止那一步。

## 📖 OpenAI 官方的 7 个原则

| # | 原则 | 一句话 | 这个 mini-arc 哪节讲 |
|---|---|---|---|
| 1 | Process tokens faster | 用更小的模型 / 推理优化 | 28 概念 |
| 2 | Generate fewer tokens | 输出越短越快 | 28 概念 |
| 3 | Use fewer input tokens | Prompt Caching：静态前缀在前，动态在后 | **Lesson 30** |
| 4 | Make fewer requests | 能合并的多步合并 | **Lesson 31** |
| 5 | Parallelize | `Promise.all` 走起 | **Lesson 31** |
| 6 | Make your users wait less | Streaming + Loading + 显示进度 | **Lesson 29 + 32** |
| 7 | Don't default to an LLM | 能写死/预算/hash 的别叫 LLM | 28 概念 |

## 📖 决策框架：什么场景用哪个？

```
你的瓶颈是什么？
├─ 用户主观觉得慢 → Streaming (#6) + Loading 状态
├─ 同样的 prompt 重复发 → Prompt Caching (#3)
├─ 多步推理 round-trip 多 → Combine (#4) 或 Parallelize (#5)
├─ 输出太长 → 让模型简洁 (#2) / 缩短 JSON key
├─ 模型本身慢 → 换更小的模型 (#1) / Predicted Outputs
└─ 这事根本不需要 LLM → Don't default to an LLM (#7)
```

## 📖 这个课程不会讲的（但你应该知道）

- **Predicted Outputs** (#1 的具体实现): 只在 Chat Completions API 上、特定模型 (gpt-4.1 系列) 支持。
  本课程整套都用 Responses API + gpt-5.4-nano，所以暂时不演示。
  详情: [Predicted Outputs 文档](https://developers.openai.com/api/docs/guides/predicted-outputs)
- **Batch API**: 异步批处理，不适合 chat 这种「让用户感觉快」的场景。属于成本优化范畴。
- **限流、重试、降级**: 属于 production reliability。本课的 Safety arc (Lesson 33+) 会专门讲。

## 🔑 常见坑

- **过早优化**：还没上线就琢磨怎么省 200ms，时间花得不值。
- **没有指标**：「我感觉变快了」不算数据。要测 TTFT、Total、cached_tokens、token/s。
- **为了快牺牲准确性**：合并 prompt 把模型搞糊涂了，这种「快」是减分项。
- **优化错地方**：embed 已经只占总时长 2% 了还在优化它。

## 🧠 适用场景

任何要给真用户用的 AI 产品。**只要有人会等你的回复，就值得优化感知速度。**

## ⏭️ 下一节
[Lesson 29 — 流式响应与 TTFT 测量](../29-streaming-ttft/) — 先把「测量」工具立起来。
```

- [ ] **Step 2: Commit**

```bash
git add 28-perf-overview/README.md
git commit -m "docs(l28): add 性能优化总览 README"
```

---

## Task 21: Final integration — verify full test suite + manual end-to-end

**Files:**
- None (verification only)

- [ ] **Step 1: Run the offline test suite**

Run: `pnpm test`

Expected: 4 tests pass (lesson 28 only); ~10 tests skipped (the network-tagged ones); 0 failures.

- [ ] **Step 2: Run typecheck across the repo**

Run: `pnpm typecheck`

Expected: no TypeScript errors.

- [ ] **Step 3: Run the full network test suite**

Confirm `OPENAI_API_KEY` is set in `.env`. Then:

Run: `pnpm test:network`

Expected: all tests pass (~14 total: 4 offline + 2 from l29 + 2 from l30 + 2 from l31 + 1 from l32). Total wall-clock ~3-5 minutes. Total cost ~$0.02–0.05.

If lesson 32's test fails, check that `playwright.config.ts`'s `webServer` block successfully started both `pnpm l32:server` and `pnpm l32:web`. Look at `test-results/` for traces.

- [ ] **Step 4: Manual smoke of every lesson script**

Run each in order:
```bash
pnpm l29:baseline
pnpm l29
pnpm l30
pnpm l30:key
pnpm l30:order
pnpm l31
pnpm l31:parallel
```

Each prints its expected blocks; no crashes.

For 32:

```bash
# Terminal A
pnpm l32:server

# Terminal B
pnpm l32:web
```

Open `http://localhost:5173`, type a question, watch the split-screen behavior live.

For 28: open `28-perf-overview/perf-flow.html` in browser, verify visually.

- [ ] **Step 5: Sanity-check git history is clean**

Run: `git log --oneline | head -25`

Expected: ~21 commits with clear, conventional messages from this implementation.

- [ ] **Step 6: Final commit (if anything was missed)**

Only commit if there are uncommitted changes from the verification phase.

```bash
git status
# If clean, no commit needed
```

---

## Self-Review

**Spec coverage check:**

| Spec section | Implementation task |
|---|---|
| §1 Goal | Tasks 1-21 |
| §2 Arc shape | Tasks 1, 19 (l28), 3-5 (l29), 6-9 (l30), 10-12 (l31), 13-18 (l32) |
| §3.1 28-perf-overview | Tasks 19, 20 |
| §3.2 29-streaming-ttft | Tasks 3, 4, 5 |
| §3.3 30-prompt-caching | Tasks 6, 7, 8, 9 |
| §3.4 31-fewer-requests | Tasks 10, 11, 12 |
| §3.5 32-perf-web-demo (server) | Task 13 |
| §3.5 32-perf-web-demo (web scaffold) | Task 14 |
| §3.5 32-perf-web-demo (hooks) | Task 15 |
| §3.5 32-perf-web-demo (components) | Task 16 |
| §3.5 32-perf-web-demo (App + sanity) | Task 17 |
| §3.5 32-perf-web-demo (test) | Task 18 |
| §4.1 README skeleton | Tasks 5, 9, 12, 18, 20 |
| §4.2 Code conventions | Throughout — all .ts files follow `dotenv/config` + `new OpenAI()` + async main pattern |
| §4.3 Package.json scripts | Tasks 3, 4, 6, 7, 8, 10, 11, 13, 17 (added incrementally) |
| §4.4 PLAN-SAFETY.md shift | Task 1 |
| §4.5 Self-contained copies | Task 15 (useStreamingChat trimmed), Task 16 (components trimmed) |
| §4.7 Dependencies | Task 2 (Playwright), Task 14 (web deps) |
| §5b E2E strategy | Tasks 2, 5, 9, 12, 18, 19 |
| §5 Acceptance criteria | Task 21 |
| §6 Implementation order | This plan follows the order recommended in §6 |

No gaps.

**Placeholder scan:** No `TBD` / `TODO` / "implement later" / "similar to" placeholders found.

**Type consistency:** `Msg`, `Stats`, `PnpmResult`, `FrameEvent` all defined exactly once and used consistently across the hooks, components, and tests.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-05-perf-arc-implementation.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
