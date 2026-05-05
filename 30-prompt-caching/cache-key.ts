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
