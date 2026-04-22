/**
 * Lesson 25b · 只用 Vector Store 的 Retrieval API（不调 LLM）
 * -----------------------------------------------------------
 * 目标：直接调 `client.vectorStores.search`，看 OpenAI 托管的
 *        retrieval 返回什么结构。这比第 26 课的 file_search tool 更底层。
 *
 * 2026 关键点：
 *   - rewrite_query: true → OpenAI 自动把口语化问题改写成关键词更好的查询
 *   - max_num_results: 1~50；默认 10。真实项目常用 3~5
 *   - 返回的是 PagePromise，可以 for-await 遍历
 *   - 每条结果含 score + content[].text + filename
 *
 * 运行：
 *   pnpm l25:query                                  # 默认问题
 *   pnpm l25:query "幼猫三个月能订吗？"
 *   pnpm l25:query "可以暂停配送吗？"
 */

import "dotenv/config";
import OpenAI from "openai";

const client = new OpenAI();
const vsId = process.env.VECTOR_STORE_ID;
if (!vsId) {
  console.error("❌ 请先运行 pnpm l25:create，把 VECTOR_STORE_ID=vs_xxx 加到 .env");
  process.exit(1);
}

const question = process.argv[2] ?? "PurrCloud 每月配送几次？";

console.log(`🔎 Query: "${question}"\n`);

const results = await client.vectorStores.search(vsId, {
  query: question,
  max_num_results: 3,
  rewrite_query: true, // 让 OpenAI 把"我想知道...配送..."改写成"配送频率"
});

let i = 0;
for await (const r of results) {
  i++;
  const text = r.content[0]?.text ?? "";
  console.log(`[${i}] score=${r.score.toFixed(3)}  file=${r.filename}`);
  console.log(`    ${text.slice(0, 160).replace(/\n/g, " ")}...\n`);
}

if (i === 0) {
  console.log("⚠️  没有检索到任何结果。可能 vector store 还在索引中。");
}
