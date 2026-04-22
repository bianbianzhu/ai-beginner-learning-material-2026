/**
 * Lesson 23b · 用 embedding 算相似度
 * -----------------------------------------------------------
 * 目标：让学生看到 "语义相似" 是可计算的。
 *
 * 实验：4 个句子，query 和哪句最像？
 *   - embed 5 段文字（一次批量）
 *   - 计算 cosine（因为已归一化，直接 dot product 即可）
 *   - 从高到低排序
 *
 * 运行：pnpm l23:sim
 */

import "dotenv/config";
import OpenAI from "openai";

const client = new OpenAI();

const sentences = [
  "I love cats, they are fluffy and cute.",
  "猫咪是一种非常可爱的家养宠物。",
  "The stock market crashed heavily this morning.",
  "我今天早上吃了一碗兰州拉面。",
];
const query = "feline pets make wonderful companions";

// 批量 embedding：input 支持数组
const { data } = await client.embeddings.create({
  model: "text-embedding-3-small",
  input: [...sentences, query],
});

const queryVec = data[sentences.length].embedding;

// OpenAI embeddings 默认 L2 归一化 → cosine === dot product
function cosine(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

const scored = sentences.map((text, i) => ({
  text,
  score: cosine(queryVec, data[i].embedding),
}));
scored.sort((a, b) => b.score - a.score);

console.log(`🔎 Query: "${query}"\n`);
console.log("按相似度从高到低：\n");
for (const { text, score } of scored) {
  const bar = "█".repeat(Math.round(score * 40));
  console.log(`  ${score.toFixed(3)}  ${bar}`);
  console.log(`          ${text}\n`);
}
