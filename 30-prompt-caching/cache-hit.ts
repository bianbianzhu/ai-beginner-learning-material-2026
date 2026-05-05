import "dotenv/config";
import OpenAI from "openai";
import { LONG_KB } from "./fake-kb.js";

// Lesson 30 · cache-hit.ts
// Prompt Caching 是 OpenAI 自动启用的：prompt ≥ 1024 tokens 后就生效。
// 第一次调用是「冷调用」(cold)，第二次同样的前缀就能命中缓存 (warm)。
// 我们看 usage.input_tokens_details.cached_tokens 来证明。
//
// 注意：缓存命中是「尽力而为」的——OpenAI 按前缀 hash 路由，但低流量时两次请求
// 可能落在不同机器上。通过传入 prompt_cache_key，可以让同一个 key 的请求更稳定
// 地路由到同一台机器，让演示效果更可重现。这不影响「不需要任何代码改动才能享受
// 缓存」这一核心原理——prompt_cache_key 只是路由辅助，缓存本身仍然自动生效。

const client = new OpenAI();

async function callOnce(label: string, question: string) {
  const resp = await client.responses.create({
    model: "gpt-5.4-nano",
    instructions: LONG_KB,            // ← 长静态前缀，放在最前面
    input: question,                  // ← 短动态后缀，放在末尾
    prompt_cache_key: "l30-cache-hit-demo",  // ← 帮助路由，让 cold→warm 更稳定可见
  });

  const inputTokens = resp.usage?.input_tokens ?? 0;
  const cachedTokens = resp.usage?.input_tokens_details?.cached_tokens ?? 0;
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
