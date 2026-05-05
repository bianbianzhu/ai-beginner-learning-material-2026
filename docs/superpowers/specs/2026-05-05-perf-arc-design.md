# Performance Optimization Mini-Arc — Design Spec

**Date:** 2026-05-05
**Scope:** Sections 28–32 of *AI in 2026* course
**Theme:** 性能优化 — "AI 服务能不能快到可用"
**Status:** Approved by user, ready for implementation plan

---

## 1. Goal

Add a 5-lesson mini-arc teaching AI service performance optimization, organized around OpenAI's official **7-principle latency taxonomy**. Lessons follow the established course pattern (one self-contained folder per lesson, `pnpm lN[:variant]` runner, Chinese-language READMEs in the 14–27 style, `gpt-5.4-nano` model, Responses API exclusively, no shared modules).

Pedagogical positioning: this arc lands after the RAG arc (22–27) and before the planned safety arc (renumbered to 33+). It assumes the student has finished 01–27, so the arc can leverage prior knowledge of streaming (14), Express patterns (10/13), Responses API anatomy (04), and tool-calling (07/12).

Source authority: all optimization techniques come from official OpenAI guides retrieved via the `openaiDeveloperDocs` MCP on 2026-05-05:
- `https://developers.openai.com/api/docs/guides/latency-optimization` — the 7 principles
- `https://developers.openai.com/api/docs/guides/prompt-caching` — caching mechanics, `prompt_cache_key`, retention
- `https://developers.openai.com/api/docs/guides/streaming-responses` — semantic events
- `https://developers.openai.com/api/docs/guides/predicted-outputs` — for explicit "why we don't demo this" framing

---

## 2. Arc shape

| # | Folder | Type | OpenAI principle(s) | Key takeaway |
|---|---|---|---|---|
| 28 | `28-perf-overview/` | Concept-only (HTML viz + README) | All 7 introduced | "AI 慢, 大多不是算力问题, 是系统设计问题" |
| 29 | `29-streaming-ttft/` | Runnable scripts | #6 Make users wait less + measurement discipline | TTFT (time-to-first-token) ≫ total latency for perceived speed |
| 30 | `30-prompt-caching/` | Runnable scripts | #3 Use fewer input tokens (KV cache) | Static prefix first, dynamic suffix last; observe `cached_tokens` |
| 31 | `31-fewer-requests/` | Runnable scripts | #4 Make fewer requests + #5 Parallelize | Combine sequential prompts; `Promise.all` for independent calls |
| 32 | `32-perf-web-demo/` | Express + React frontend | Showcase: streaming UX | Visceral split-screen UX gap (slow vs fast) |

### Explicitly out of scope
- **Predicted Outputs** — Chat Completions only, doesn't fit course's Responses API stack on `gpt-5.4-nano`. Mentioned in 28 README as "exists but not for our stack."
- **Batch API** — async, doesn't fit "feel fast" theme. Future cost-optimization arc material.
- **Rate limiting / retry / fallback / 降级** — overlaps with planned safety arc (33+). Mentioned in 28 overview, no code.
- **Don't-default-to-LLM (#7)** — covered conceptually in 28, no script.
- **Process tokens faster (#1) and Generate fewer tokens (#2)** — covered conceptually in 28; no dedicated lesson because they're prompt-engineering tactics already touched in 02/03/06.

---

## 3. Per-lesson detail

### 3.1 `28-perf-overview/`

**Files:**
```
README.md       # Chinese teaching content
perf-flow.html  # Dark-theme (#0f172a) timeline viz, matching 22-rag-concept style
```

**No runnable script.** Pattern matches sections 05/08/09/21/22.

**README structure:**
```markdown
# Lesson 28 · 性能优化总览
## 🎯 本课学完后你会
## 📖 为什么"能用"还不够
## 📖 拆解一次完整的 AI 请求
## 📖 OpenAI 官方的 7 个原则
   ### 1. Process tokens faster
   ### 2. Generate fewer tokens
   ### 3. Use fewer input tokens          → 详见 Lesson 30
   ### 4. Make fewer requests             → 详见 Lesson 31
   ### 5. Parallelize                     → 详见 Lesson 31
   ### 6. Make your users wait less       → 详见 Lesson 29 + 32
   ### 7. Don't default to an LLM
## 📖 决策框架: 什么场景用哪个原则
## 🔑 常见坑 (过早优化、没有指标)
## 🧠 适用场景
## ⏭️ 下一节: Lesson 29 streaming + TTFT 测量
```

**HTML viz (`perf-flow.html`):**
- Single-file static HTML, dark theme matching `22-rag-concept/rag-flow.html`
- Renders a horizontal timeline of one full AI request: client → server → RAG embed → vector search → prompt build → LLM generate → SSE stream → render
- Color-coded bars sized by typical latency contribution
- 7 numbered badges marking which segment each principle attacks
- Bottom takeaway box with one-line summary
- No JS dependencies; opened directly in browser (or via Live Server on port 5501 per `.vscode/settings.json`)

**No `pnpm l28` script** — matches existing pattern for HTML-only concept lessons (08, 09, 22). Open via VS Code Live Server (`.vscode/settings.json` already configures port 5501) or directly in browser. README documents both options.

---

### 3.2 `29-streaming-ttft/`

**Files:**
```
README.md
baseline.ts   # Non-streaming: measure total wall-clock latency
streaming.ts  # Streaming: measure TTFT + total
```

**Conventions:** both scripts are < 80 lines, follow the `import "dotenv/config"` → `new OpenAI()` → `async main()` → `.catch(...).process.exit(1)` pattern. Inlined `measureLatency()` helper (no shared module).

**`baseline.ts`** — Responses API, `stream: false`:
```ts
const start = performance.now();
const resp = await client.responses.create({
  model: "gpt-5.4-nano",
  input: "用大约 300 字介绍黑洞...",
});
const total = performance.now() - start;
console.log(`========== 非-streaming (baseline) ==========`);
console.log(`TTFT:   N/A (整段一起返回)`);
console.log(`Total:  ${total.toFixed(0)} ms`);
console.log(`Tokens: ${resp.usage?.output_tokens}`);
```

**`streaming.ts`** — Responses API, `stream: true`:
```ts
const start = performance.now();
let ttft: number | null = null;
const stream = await client.responses.create({
  model: "gpt-5.4-nano",
  input: "用大约 300 字介绍黑洞...",
  stream: true,
});
let outputTokens = 0;
for await (const ev of stream) {
  if (ev.type === "response.output_text.delta" && ttft === null) {
    ttft = performance.now() - start;
  }
  if (ev.type === "response.completed") {
    outputTokens = ev.response.usage?.output_tokens ?? 0;
  }
}
const total = performance.now() - start;
console.log(`========== streaming ==========`);
console.log(`TTFT:   ${ttft?.toFixed(0)} ms   ← 用户 ${(ttft! / 1000).toFixed(1)}s 就开始看到字`);
console.log(`Total:  ${total.toFixed(0)} ms   ← 总时长几乎相同`);
console.log(`Tokens: ${outputTokens}`);
```

**Teaching emphasis (in README):**
- Total latency ≈ same; perceived latency drops dramatically
- TTFT is the metric that matters for chat UX; total time matters for batch jobs
- Quote OpenAI: *"Streaming: The single most effective approach, as it cuts the waiting time to a second or less."*
- Forward-ref to 32 for the visual proof

**Scripts:**
```
"l29":          "tsx 29-streaming-ttft/streaming.ts",
"l29:baseline": "tsx 29-streaming-ttft/baseline.ts"
```

---

### 3.3 `30-prompt-caching/`

**Files:**
```
README.md
cache-hit.ts     # Same long prefix called twice — observe cached_tokens 0 → ~prefix on call 2
cache-key.ts     # Demonstrate prompt_cache_key for routing influence
prefix-order.ts  # Static-prefix-first vs dynamic-prefix-first, show cached_tokens delta
```

**Hard requirement from official docs:** caching only kicks in at **≥1024 tokens**. All three scripts construct a deliberately long "fake company KB" string (~2000 tokens of plausible Chinese text — can be any policy/product description) to clear the threshold.

**`cache-hit.ts`** — minimum viable demo:
- Build a `LONG_SYSTEM_PROMPT` (~2000 tokens) string at top of file
- Call `client.responses.create({ instructions: LONG_SYSTEM_PROMPT, input: "短问题 1" })` twice
- After each call, log `resp.usage?.prompt_tokens_details?.cached_tokens` and the cache hit ratio
- Expected output:
  ```
  Call 1 (cold):  cached_tokens=0    ratio=0%
  Call 2 (warm):  cached_tokens=2010 ratio=98%   ← 缓存命中
  ```

**`cache-key.ts`** — `prompt_cache_key` parameter:
- Same long prefix, two distinct `prompt_cache_key` values
- Demonstrates that the parameter influences routing and is recommended for shared-prefix multi-tenant workloads
- Quote from official doc on the 15-RPM threshold for cache stability

**`prefix-order.ts`** — the killer demo:
- Two scripts in one file: same total tokens, different ordering
  - Bad: `instructions: "[short static]" + input: "[long dynamic context]\n[user question]"`
  - Good: `instructions: "[long static context]" + input: "[short user question]"`
- Same call made twice each ordering → second call's `cached_tokens` will be much higher in the "Good" version
- Print 2x2 table showing the gap

**Teaching emphasis (README):**
- Caching is **automatic, free, no code change required** at ≥1024 tokens
- Only cache hits are exact prefix matches → static content first, dynamic last
- `prompt_cache_key` controls routing for high-volume shared-prefix scenarios
- Default retention is `in_memory` (5–10 min, up to 1 hour); for `gpt-5.5`+ the default is `24h`. Pass `prompt_cache_retention: "24h"` explicitly for extended retention on supported models
- `usage.prompt_tokens_details.cached_tokens` is the observable metric

**Scripts:**
```
"l30":       "tsx 30-prompt-caching/cache-hit.ts",
"l30:key":   "tsx 30-prompt-caching/cache-key.ts",
"l30:order": "tsx 30-prompt-caching/prefix-order.ts"
```

---

### 3.4 `31-fewer-requests/`

**Files:**
```
README.md
combine.ts   # Two sequential prompts vs one combined JSON-output prompt
parallel.ts  # Three independent prompts: sequential vs Promise.all
```

**`combine.ts`** — mirrors the OpenAI cookbook's customer-service-bot example, adapted to the course's tone:
- Bad version (2 sequential calls):
  1. "把用户最新一句话改写成自包含搜索 query"
  2. "回答 query"
  - Both await sequentially → ~2× latency
- Good version (1 combined call):
  - One prompt asks for both, returns `{ query: string, answer: string }` JSON
  - Single call → ~1× latency
- Wall-clock both, print comparison

**`parallel.ts`** — speculative parallelism:
- Three independent classifications of the same input: sentiment / language / topic
- Sequential version: `await s; await l; await t` → sum of three latencies
- Parallel version: `await Promise.all([s, l, t])` → max of three latencies
- Print speedup factor (typically ~2.5–3×)

**Teaching emphasis (README):**
- Each round-trip has fixed overhead; collapse sequential steps into one prompt when reasoning permits
- For independent steps, `Promise.all` is the simplest, biggest win
- Quote from official doc: *"Two shirts take just as long to dry as one"*
- Caveat: doesn't always work — combining prompts can hurt quality if the model needs to think hard about each step. Test, don't assume.

**Scripts:**
```
"l31":          "tsx 31-fewer-requests/combine.ts",
"l31:parallel": "tsx 31-fewer-requests/parallel.ts"
```

---

### 3.5 `32-perf-web-demo/`

**Subdirs:**
```
server/
  server.ts        # Express v5, 2 routes
web/
  package.json
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

**`server/server.ts`** — fresh write, ~120 lines, copying SSE writer pattern from `14-streaming-chat/server/server.ts` but stripped of session middleware, tools, agent loop:

- Express v5, `express.json({ limit: "1mb" })`, `cors()`
- `GET /healthz` → `{ ok: true }`
- `POST /api/chat/slow`:
  - Body: `{ question: string }`
  - Calls `client.responses.create({ stream: false, model: "gpt-5.4-nano", input: question })`
  - Awaits full response
  - Returns `{ answer: resp.output_text, total_ms, output_tokens }`
- `POST /api/chat/fast`:
  - Body: `{ question: string }`
  - Opens SSE: `res.setHeader("Content-Type", "text/event-stream"); res.flushHeaders();`
  - Calls `client.responses.create({ stream: true, model: "gpt-5.4-nano", input: question })`
  - Emits `event: delta\ndata: {"text": "..."}\n\n` on each `response.output_text.delta`
  - Emits `event: done\ndata: {"ttft_ms":N,"total_ms":N,"tokens":N}\n\n` on `response.completed`
  - Stateless, no session.

**Frontend split layout:**
```
┌────────────┬────────────┐
│   SLOW     │    FAST    │
│ (no stream)│ (streaming)│
├────────────┼────────────┤
│   ⏳        │ 黑洞是宇宙中  │
│  loading…  │ 一种由质量极  │
│            │ 度密集的天体  │
│            │ 形成的区域…   │
├────────────┼────────────┤
│ TTFT: —    │ TTFT: 612ms│
│ Total: —   │ Total: 1.2s│
└────────────┴────────────┘
       ↑ Composer (single input, fires both)
```

**`useSlowChat.ts`** — fresh write, ~60 lines:
- State: `messages: Msg[]`, `isPending: boolean`, `stats: { totalMs?: number; tokens?: number }`
- `send(question)`: pushes user msg + empty assistant placeholder, fetches `/api/chat/slow`, awaits JSON, sets assistant msg + stats on done

**`useStreamingChat.ts`** — copied from `14-streaming-chat/web/src/useStreamingChat.ts`, then trimmed:
- Remove tool-call event handling (`tool_start`, `tool_args_delta`, `tool_result`)
- Remove session reset / `/api/chat/reset` call
- Keep: `delta` text accumulation, `done` final stats, `error` handling, `AbortController`
- Adapt URL to `/api/chat/fast`
- Track TTFT locally (timestamp of first delta event arrival)

**`Composer.tsx`** — single input bar at the bottom. On submit:
```ts
const handleSend = (text: string) => {
  slowChat.send(text);     // fires both in same tick
  fastChat.send(text);
};
```

**`StatsBar.tsx`** — NEW: shows `TTFT` and `Total ms` and `tokens` for one side, updates live as the streaming completes.

**`MessageList.tsx`, `Bubble.tsx`** — copied from 14, simplified (remove `ToolBubble` references and tool-call branches in render logic).

**`vite.config.ts`** — copied from `14-streaming-chat/web/vite.config.ts`, change proxy port if needed; otherwise identical.

**`web/package.json`** — copied from 14's `web/package.json`. Same React 19 + Vite 6 + TS deps. Rename to `ai-in-2026-l32-web` to avoid pnpm workspace name collisions.

**Scripts:**
```
"l32:server": "tsx 32-perf-web-demo/server/server.ts",
"l32:web":    "pnpm -C 32-perf-web-demo/web dev"
```

**Run instructions in README:** start server in one terminal (`pnpm l32:server`), web in another (`pnpm l32:web`), open `http://localhost:5173`, type one question, watch the perceived-speed gap.

---

## 4. Cross-cutting

### 4.1 README skeleton (29–32, matching 14–27 style)

```markdown
# Lesson N · <title>
## 🎯 本课学完后你会
## 📦 目录结构
## 🚀 运行
## 📖 <concept>
### sub-sections
## 🔑 常见坑
## 🧠 适用场景
## ⏭️ 下一节
```

28's README skeleton skips `📦 目录结构` and `🚀 运行`'s script-launch portion since it's HTML-only.

### 4.2 Code conventions (preserved from earlier sections)

- `import "dotenv/config";` first
- `import OpenAI from "openai";` then `const client = new OpenAI();` with comment about env var auto-read
- `async function main() { ... }` at bottom called via `main().catch(err => { console.error(err); process.exit(1); });`
- Default model: `gpt-5.4-nano`
- Plain `console.log` + emoji prefixes (✅ ⏱️ 📊 ❌ 📁) — no chalk/boxen/ora
- TS ESM, no top-level await
- For each script: a `measureLatency()` helper inlined per-file (no shared utils — per user instruction)
- READMEs in Chinese, code/identifiers/log-output in English where natural

### 4.3 `package.json` script additions

```json
"l29":          "tsx 29-streaming-ttft/streaming.ts",
"l29:baseline": "tsx 29-streaming-ttft/baseline.ts",
"l30":          "tsx 30-prompt-caching/cache-hit.ts",
"l30:key":      "tsx 30-prompt-caching/cache-key.ts",
"l30:order":    "tsx 30-prompt-caching/prefix-order.ts",
"l31":          "tsx 31-fewer-requests/combine.ts",
"l31:parallel": "tsx 31-fewer-requests/parallel.ts",
"l32:server":   "tsx 32-perf-web-demo/server/server.ts",
"l32:web":      "pnpm -C 32-perf-web-demo/web dev"
```

### 4.4 `PLAN-SAFETY.md` shift

- Bump section numbers 28→33, 29→34, …, 37→42 (one-line shift per section header + inline cross-refs)
- Add a one-line preamble: `> Sections 28-32 是性能优化 mini-arc，详见 docs/superpowers/specs/2026-05-05-perf-arc-design.md。Safety arc 顺延到 33+.`

### 4.5 Self-contained: what gets copied

**From section 14:**
- `web/src/useStreamingChat.ts` → `32/web/src/hooks/useStreamingChat.ts` (trimmed)
- `web/src/components/{Composer,MessageList,Bubble}.tsx` → `32/web/src/components/` (trimmed)
- `web/{vite.config.ts,index.html,package.json,main.tsx,styles.css}` → `32/web/` (scaffold)
- SSE writer pattern from `server/server.ts` → re-implemented inline in `32/server/server.ts` (no shared module — the pattern is small)

**Not reused (intentionally):**
- `14/server/session.ts` — 32 is stateless
- `14/server/tools.ts` — 32 has no tools
- `14`'s agent loop logic — 32 is single-turn

### 4.6 `.env.example` — no change

Uses existing `OPENAI_API_KEY`. No new env vars introduced.

### 4.7 Dependencies

**Runtime deps (already in root `package.json`, no change):**
- `openai@^6.34.0` (Responses API + streaming)
- `express@^5.0.1`, `cors@^2.8.6` (server)
- React 19 / Vite 6 (32/web/package.json mirrors 14/web/package.json)

**New devDependency for e2e tests:**
- `@playwright/test@^1.59.1` (verified reachable on 2026-05-05)

After install: `pnpm exec playwright install chromium` (one-time, ~150 MB, gitignored).

---

## 5. Acceptance criteria (per lesson)

**28-perf-overview** is complete when:
- README explains all 7 OpenAI principles in Chinese with cross-refs to 29/30/31/32
- `perf-flow.html` opens in a browser and renders the timeline + 7 badges
- README documents how to open the HTML (Live Server on port 5501 or directly in browser) — matches sections 08/09/22 pattern, no pnpm script

**29-streaming-ttft** is complete when:
- `pnpm l29:baseline` prints a "non-streaming" block with `Total: NNNN ms`
- `pnpm l29` prints a "streaming" block with `TTFT: NNN ms` and `Total: NNNN ms`, where TTFT < Total/3 in typical runs
- README explains why TTFT matters and connects to lesson 14's streaming mechanics

**30-prompt-caching** is complete when:
- `pnpm l30` shows `cached_tokens=0` on first call, large `cached_tokens` on second call (≥80% of input)
- `pnpm l30:order` shows clear cache-hit gap between bad and good prefix ordering
- README explains the ≥1024-token threshold, automatic-and-free nature, structuring rule, and `prompt_cache_key`

**31-fewer-requests** is complete when:
- `pnpm l31` shows combined call ≈ 50% of two-call total time
- `pnpm l31:parallel` shows parallel call ≈ max(individual times), not sum
- README documents the trade-off (combining can hurt quality)

**32-perf-web-demo** is complete when:
- `pnpm l32:server` starts an Express server on a configurable port (default 3000)
- `pnpm l32:web` starts Vite dev server with `/api` proxy
- Opening `http://localhost:5173`, typing a question, hitting send: slow side spins, fast side starts streaming within ~1s
- StatsBar shows TTFT for fast side and Total for both
- All web frontend files are self-contained inside `32/web/` (no imports from `../14-streaming-chat/`)

**E2E test suite** is complete when:
- `pnpm test` (offline default) passes: only `l28-overview.spec.ts` runs, all assertions green
- `pnpm test:network` (with `OPENAI_API_KEY` set) passes: all 5 specs run, no test < 100% pass on a fresh `gpt-5.4-nano`-priced run
- Playwright `webServer` config in `l32-web-demo.spec.ts` cleanly starts and tears down both `l32:server` and `l32:web` per test
- Total cost of one full `pnpm test:network` run is under $0.05 USD (sanity ceiling)

---

## 5b. End-to-end testing strategy

**Framework:** Playwright (`@playwright/test`, version 1.59.1+). Confirmed reachable via `pnpm dlx playwright --version` on 2026-05-05. No browser MCP needed — direct Node dev dependency.

**Layout:** Single `tests/` folder at repo root. The "no shared modules" rule applies to student-facing course code; test infrastructure is maintainer scaffolding and merits centralization.

```
tests/
  playwright.config.ts
  l28-overview.spec.ts        # Playwright DOM smoke on HTML viz
  l29-streaming.spec.ts       # Spawn CLI scripts, assert stdout patterns
  l30-caching.spec.ts         # Spawn CLI scripts, assert cached_tokens jump
  l31-fewer-requests.spec.ts  # Spawn CLI scripts, assert timing relations
  l32-web-demo.spec.ts        # Playwright + webServer for split-screen UX
  helpers/
    spawn-pnpm.ts             # Helper to run a pnpm script and capture stdout
```

**Network gating:** Tests that require real OpenAI API calls (29, 30, 31, 32) are gated by `RUN_NETWORK_TESTS=1` env var. Default `pnpm test` runs only the offline-safe 28 spec. `pnpm test:network` runs the full suite.

**Per-lesson test scope:**

| Lesson | What to verify | Network? | Approx cost per run |
|---|---|---|---|
| 28 | HTML loads (file://), title contains "性能", ≥7 principle badges in DOM, timeline element present | No | Free |
| 29 | `pnpm l29:baseline` stdout matches `/Total:\s+\d+ ms/`; `pnpm l29` stdout has both `TTFT:` and `Total:` lines; parsed TTFT < Total | Yes | ~$0.001 |
| 30 | `pnpm l30` stdout matches `cached_tokens=0` for call 1 AND `cached_tokens=[1-9]\d+` for call 2; `pnpm l30:order` shows higher cached_tokens in "good" ordering | Yes | ~$0.005 |
| 31 | `pnpm l31` shows combined-call total < (call_1 + call_2); `pnpm l31:parallel` shows parallel total < sequential total | Yes | ~$0.002 |
| 32 | Playwright launches Chromium via `webServer` config managing both `pnpm l32:server` and `pnpm l32:web`. Navigates to `http://localhost:5173`. Types a fixed question into Composer, clicks send. Asserts: slow side shows loading spinner; fast side has visible text within 5s; both sides eventually settle into a non-empty answer; fast-side StatsBar shows `TTFT` in ms | Yes | ~$0.002 |

**`tests/playwright.config.ts`:**
- `testDir: "."` (relative to `tests/`)
- `use: { baseURL: "http://localhost:5173" }` for the web spec only
- `webServer` config in `l32-web-demo.spec.ts` only (other specs don't need a web server)
- One project, Chromium only — Firefox/Safari coverage isn't necessary for a teaching course
- `timeout: 30_000` for streaming tests (the `gpt-5.4-nano` Total can be 5–10s)

**Dependencies to add (root `package.json` `devDependencies`):**
- `@playwright/test@^1.59.1`

After install, `pnpm exec playwright install chromium` downloads the browser binary (~150 MB, one-time, gitignored).

**Scripts to add to root `package.json`:**
```json
"test":         "playwright test --grep-invert @network",
"test:network": "RUN_NETWORK_TESTS=1 playwright test"
```

(Use `@network` Playwright tag on tests that hit the API; `--grep-invert @network` excludes them by default.)

**Deliberately NOT in scope for this arc:**
- Mocking the OpenAI SDK — defeats the point of e2e tests for AI-using lessons; use the env gate instead
- CI integration — out of scope for this design; user can wire to GitHub Actions later if needed
- Multi-browser / mobile viewport tests — Chromium-only is sufficient
- Visual regression snapshots — overkill for a teaching repo

---

## 6. Implementation order recommendation

1. **PLAN-SAFETY.md renumber first** (one-shot edit, no dependencies)
2. **Test infra setup**: install `@playwright/test`, run `playwright install chromium`, scaffold `tests/playwright.config.ts` and `tests/helpers/spawn-pnpm.ts` (zero coupling to lessons; can be done independently)
3. **29 → 30 → 31** in numeric order (each script is independent). Write the lesson code, then the matching `tests/lNN-*.spec.ts`.
4. **32 web demo** after 29 (reuses streaming concept). Server first, then web frontend, then `tests/l32-web-demo.spec.ts`.
5. **28 overview last** (concept lesson — easier to write the synthesis after the demos exist), with `tests/l28-overview.spec.ts`.
6. **package.json scripts** added incrementally per lesson; the test scripts (`test`, `test:network`) added during step 2.

---

## 7. Open questions

None at design time. All scope decisions confirmed with user before this spec was written. If implementation surfaces ambiguity, raise it before guessing.

---

## 8. References

- OpenAI Latency Optimization Guide: https://developers.openai.com/api/docs/guides/latency-optimization
- OpenAI Prompt Caching Guide: https://developers.openai.com/api/docs/guides/prompt-caching
- OpenAI Streaming Responses Guide: https://developers.openai.com/api/docs/guides/streaming-responses
- OpenAI Predicted Outputs Guide: https://developers.openai.com/api/docs/guides/predicted-outputs (cited for "why we don't demo this")
- Existing course conventions: see `AGENTS.md`, `package.json`, sections 14–27 READMEs
