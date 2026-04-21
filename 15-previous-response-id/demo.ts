/**
 * Lesson 15 · previous_response_id — 非交互式演示
 * -----------------------------------------------------------
 * 用 3 轮对话展示 previous_response_id 的效果：
 *   第 1 轮：告诉 AI 自己的名字
 *   第 2 轮：问 AI 自己叫什么（验证它记住了）
 *   第 3 轮：问一个需要上下文的追问（验证链式记忆）
 *
 * 运行：pnpm l15:demo
 */

import "dotenv/config";
import OpenAI from "openai";

const client = new OpenAI();
const MODEL = "gpt-5.4-nano";

async function main() {
  console.log("=== Lesson 15 · previous_response_id 演示 ===\n");

  // ── 第 1 轮：建立上下文 ──
  console.log("--- 第 1 轮 ---");
  const r1 = await client.responses.create({
    model: MODEL,
    instructions: "你是一个友好的中文助手，回答简短。",
    input: "你好，我叫 David，我在悉尼做前端工程师。",
    store: true,
  });
  console.log(`User: 你好，我叫 David，我在悉尼做前端工程师。`);
  console.log(`AI:   ${r1.output_text}`);
  console.log(`  [response_id: ${r1.id}]`);
  console.log(`  [input_tokens: ${r1.usage?.input_tokens}]\n`);

  // ── 第 2 轮：用 previous_response_id 继续 ──
  console.log("--- 第 2 轮 ---");
  const r2 = await client.responses.create({
    model: MODEL,
    input: [{ role: "user", content: "我叫什么名字？在哪个城市？" }],
    previous_response_id: r1.id, // 链接到上一轮
    store: true,
  });
  console.log(`User: 我叫什么名字？在哪个城市？`);
  console.log(`AI:   ${r2.output_text}`);
  console.log(`  [response_id: ${r2.id}]`);
  console.log(`  [input_tokens: ${r2.usage?.input_tokens}] ← 注意：包含第 1 轮的全部 tokens\n`);

  // ── 第 3 轮：继续追问 ──
  console.log("--- 第 3 轮 ---");
  const r3 = await client.responses.create({
    model: MODEL,
    input: [{ role: "user", content: "帮我用一句话介绍我自己。" }],
    previous_response_id: r2.id, // 链接到第 2 轮（间接包含第 1 轮）
    store: true,
  });
  console.log(`User: 帮我用一句话介绍我自己。`);
  console.log(`AI:   ${r3.output_text}`);
  console.log(`  [response_id: ${r3.id}]`);
  console.log(`  [input_tokens: ${r3.usage?.input_tokens}] ← 包含前 2 轮所有 tokens\n`);

  // ── 对比：没有 previous_response_id 的独立请求 ──
  console.log("--- 对比：不带 previous_response_id ---");
  const r4 = await client.responses.create({
    model: MODEL,
    input: [{ role: "user", content: "我叫什么名字？" }],
    store: true,
    // 注意：没有 previous_response_id
  });
  console.log(`User: 我叫什么名字？（没有 previous_response_id）`);
  console.log(`AI:   ${r4.output_text}`);
  console.log(`  [input_tokens: ${r4.usage?.input_tokens}] ← 只有本轮 tokens\n`);

  console.log("=== 结论 ===");
  console.log("- 有 previous_response_id → AI 记住了你是 David、在悉尼做前端");
  console.log("- 没有 previous_response_id → AI 完全不知道你是谁");
  console.log("- input_tokens 逐轮递增，因为历史 tokens 全部计费");
}

main().catch((err) => {
  console.error("Something went wrong:", err);
  process.exit(1);
});
