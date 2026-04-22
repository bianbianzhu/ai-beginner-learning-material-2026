/**
 * Lesson 26 · file_search hosted tool —— 一行 tool，LLM 自己去 RAG
 * -----------------------------------------------------------
 * 目标：和第 25 课对比，这一课 **不** 自己调 search。
 *        只在 Responses API 的 tools 数组里加一个 `{ type: "file_search" }`，
 *        模型会自动去检索 + 读结果 + 生成带引用的答案。
 *
 * 2026 关键点：
 *   - file_search 是 hosted tool，OpenAI 内部执行，不返回 function_call 让你自己处理
 *   - response.output 里会出现两种 item：
 *       { type: "file_search_call", queries, status, results? }
 *       { type: "message", content: [{ type: "output_text", text, annotations: [...] }] }
 *   - annotations 里的 `file_citation` 是"带出处的答案" → 直接能做"点原文"UI
 *   - include: ["file_search_call.results"] 才能拿到检索到的 chunk 原文
 *
 * 运行：
 *   pnpm l26
 *   pnpm l26 "配送多久能到？"
 *   pnpm l26 "退款政策是什么？"
 */

import "dotenv/config";
import OpenAI from "openai";

const client = new OpenAI();
const vsId = process.env.VECTOR_STORE_ID;
if (!vsId) {
  console.error("❌ 请先运行 pnpm l25:create，把 VECTOR_STORE_ID 加到 .env");
  process.exit(1);
}

const question = process.argv[2] ?? "PurrCloud 每月配送几次？";

console.log(`🔎 Question: "${question}"\n`);

const resp = await client.responses.create({
  model: "gpt-5.4-nano",
  instructions:
    "你是 PurrCloud 客服助手。只能根据 file_search 返回的资料作答。资料里没有的就说没有，并引导用户联系人工客服 400-MEW-CATS。",
  input: question,
  tools: [
    {
      type: "file_search",
      vector_store_ids: [vsId],
      max_num_results: 3,
    },
  ],
  // 默认只返 answer + citation，开启下面这项才返回 retrieval 的原文 chunk
  include: ["file_search_call.results"],
});

// ── 遍历 output ──────────────────────────────────────────────
for (const item of resp.output) {
  if (item.type === "file_search_call") {
    console.log(`🔧 file_search_call  id=${item.id}  status=${item.status}`);
    console.log(`   queries: ${JSON.stringify(item.queries)}`);
    for (const r of item.results ?? []) {
      const text = (r.text ?? "").slice(0, 120).replace(/\n/g, " ");
      console.log(`   - ${r.filename}  score=${r.score?.toFixed(3) ?? "n/a"}`);
      console.log(`     ${text}...`);
    }
    console.log();
  } else if (item.type === "message") {
    for (const part of item.content) {
      if (part.type === "output_text") {
        console.log("💬 Answer:\n" + part.text);
        if (part.annotations.length) {
          console.log("\n📎 Citations:");
          for (const a of part.annotations) {
            if (a.type === "file_citation") {
              console.log(`   - [${a.index}] ${a.filename}  (file_id=${a.file_id})`);
            }
          }
        }
      }
    }
  }
}

console.log("\n📊 usage:", resp.usage);
