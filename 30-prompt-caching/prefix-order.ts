import "dotenv/config";
import OpenAI from "openai";
import { LONG_KB } from "./fake-kb.js";

// Lesson 30 · prefix-order.ts
// Cache 命中只匹配「前缀完全一致」。
// 如果你把动态内容放在前面、静态长内容放在后面，缓存就废了。
// 同样的 token 总量，不同顺序，命中率天差地别。

const client = new OpenAI();

// bad ordering: 两次用不同问题，让「前缀」每次都不一样 → 演示缓存失效
// good ordering: 两次用相同问题，静态 KB 前缀一致 → 演示缓存命中
const BAD_QUESTIONS  = ["你们的退款政策？", "你们的物流几天到？"];
const GOOD_QUESTIONS = ["你们的退款政策？", "你们的退款政策？"];

async function badOrdering(question: string) {
  // ❌ 反例：动态问题在前 + 长静态 KB 在后 → 每次的「前缀」都不一样
  const resp = await client.responses.create({
    model: "gpt-5.4-nano",
    instructions: `用户当前问题：${question}\n\n参考资料如下：\n${LONG_KB}`,
    input: "请基于以上资料回答。",
  });
  return {
    input: resp.usage?.input_tokens ?? 0,
    cached: resp.usage?.input_tokens_details?.cached_tokens ?? 0,
  };
}

async function goodOrdering(question: string) {
  // ✅ 正例：长静态 KB 在 instructions、动态问题放最后的 input
  // prompt_cache_key 辅助路由，让演示中连续两次调用更稳定命中同一台机器上的缓存
  const resp = await client.responses.create({
    model: "gpt-5.4-nano",
    instructions: LONG_KB,
    input: question,
    prompt_cache_key: "l30-prefix-order-good",  // ← 只给 good ordering 加 key
  });
  return {
    input: resp.usage?.input_tokens ?? 0,
    cached: resp.usage?.input_tokens_details?.cached_tokens ?? 0,
  };
}

async function main() {
  console.log("========== 顺序对缓存命中的影响 ==========\n");

  console.log("❌ Bad ordering (dynamic-first):");
  for (const q of BAD_QUESTIONS) {
    const r = await badOrdering(q);
    console.log(`  cached_tokens=${r.cached}/${r.input}`);
  }

  console.log("");
  console.log("✅ Good ordering (static-first):");
  for (const q of GOOD_QUESTIONS) {
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
