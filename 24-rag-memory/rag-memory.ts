/**
 * Lesson 24 · Memory RAG —— 手写一个最小可跑的 RAG
 * -----------------------------------------------------------
 * 目标：把第 22 课那张图用 100 行内的代码实现一遍。
 *        学生看完后应该能说清楚 RAG 的每一步。
 *
 * 流程：
 *   1. 读取 kb/*.md
 *   2. 简单 chunker（按空行切段）
 *   3. 批量 embed → Array<{ text, source, embedding }>
 *   4. 用户问题 → embed → cosine Top-K
 *   5. 拼 context → Responses API
 *
 * 2026 关键点：
 *   - OpenAI embeddings 已 L2 归一化 → cosine = dot product
 *   - `embeddings.create` 的 `input` 支持数组，批量省大量 HTTP 开销
 *   - Top-K 建议 3~5；再大就会稀释相关信号 & 浪费 token
 *
 * 运行：
 *   pnpm l24                                    # 默认问题
 *   pnpm l24 "PurrCloud 每月配送几次？"          # 指定问题
 *   pnpm l24 "幼猫三个月能订吗？"
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const client = new OpenAI();
const EMBED_MODEL = "text-embedding-3-small";
const CHAT_MODEL = "gpt-5.4-nano";
const TOP_K = 3;

// ── 1. 读取 KB + 简单 chunker ──────────────────────────────────
type Chunk = { text: string; source: string };

function loadKb(): Chunk[] {
  const kbDir = path.join(__dirname, "kb");
  const files = fs.readdirSync(kbDir).filter((f) => f.endsWith(".md"));
  const chunks: Chunk[] = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(kbDir, file), "utf8");
    // 简单策略：按 "两个以上换行" 切段，过滤太短的
    const parts = content
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length >= 30);
    for (const p of parts) chunks.push({ text: p, source: file });
  }
  return chunks;
}

// ── 2. 批量 embed ────────────────────────────────────────────
async function embedAll(texts: string[]): Promise<number[][]> {
  const { data } = await client.embeddings.create({
    model: EMBED_MODEL,
    input: texts,
  });
  return data.map((d) => d.embedding);
}

// ── 3. cosine = dot（向量已归一化）──────────────────────────
function cosine(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// ── 4. 主流程 ────────────────────────────────────────────────
const question = process.argv[2] ?? "PurrCloud 每月配送几次？发货时间是什么时候？";

console.log("📚 读取 KB ...");
const chunks = loadKb();
console.log(`   → ${chunks.length} chunks from ${new Set(chunks.map((c) => c.source)).size} files\n`);

console.log("🧮 批量计算 embeddings ...");
const [docVecs, queryVec] = await Promise.all([
  embedAll(chunks.map((c) => c.text)),
  embedAll([question]).then((v) => v[0]),
]);

const scored = chunks.map((c, i) => ({ ...c, score: cosine(queryVec, docVecs[i]) }));
scored.sort((a, b) => b.score - a.score);
const topK = scored.slice(0, TOP_K);

console.log(`\n🔎 Top-${TOP_K} 检索结果（问题: "${question}"）：`);
topK.forEach((c, i) => {
  console.log(`  [${i + 1}] score=${c.score.toFixed(3)}  <${c.source}>`);
  console.log(`      ${c.text.slice(0, 80).replace(/\n/g, " ")}...`);
});

// ── 5. 拼 context → Responses API ────────────────────────────
const context = topK
  .map((c, i) => `[${i + 1}] (${c.source})\n${c.text}`)
  .join("\n\n");

const instructions = `你是 PurrCloud 的客服助手，用中文回答。
只能根据下面「资料」回答。如果资料里没提，就回答"抱歉，我暂时没有这个信息，请联系 400-MEW-CATS 人工客服。"
在关键事实后面用 [1] [2] 标出引用编号。`;

const resp = await client.responses.create({
  model: CHAT_MODEL,
  instructions,
  input: `资料：\n${context}\n\n问题：${question}`,
});

console.log("\n💬 回答:\n" + resp.output_text);
console.log("\n📊 usage:", resp.usage);
