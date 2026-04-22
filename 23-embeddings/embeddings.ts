/**
 * Lesson 23 · 第一个 embedding —— 把一段话变成一个向量
 * -----------------------------------------------------------
 * 目标：亲眼看到 embedding 的样子（1536 维浮点数组）。
 *
 * 2026 关键点：
 *   - 模型：text-embedding-3-small（1536 维）/ -large（3072 维）
 *   - 返回的向量已经 L2 归一化 → cosine === dot product
 *   - 可以传 dimensions 参数截短，省存储（降维精度会有损）
 *
 * 运行：pnpm l23
 */

import "dotenv/config";
import OpenAI from "openai";

const client = new OpenAI();

const text = process.argv[2] ?? "今天天气真好，适合出门遛猫";

const response = await client.embeddings.create({
  model: "text-embedding-3-small",
  input: text,
});

const vector = response.data[0].embedding;

console.log("📝 文本:", text);
console.log("📐 向量维度:", vector.length);
console.log("🔢 前 8 维:", vector.slice(0, 8).map((n) => n.toFixed(4)));
console.log("📊 用量:", response.usage);

// 快速验证它是归一化向量：norm 应该 ≈ 1.0
const norm = Math.sqrt(vector.reduce((s, x) => s + x * x, 0));
console.log("📏 L2 norm:", norm.toFixed(6), "(应 ≈ 1.0，OpenAI embeddings 默认归一化)");
