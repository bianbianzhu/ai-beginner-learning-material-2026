import "dotenv/config";
import OpenAI from "openai";

// Lesson 31 · parallel.ts
// 三个互相独立的分类任务（情感 / 语种 / 主题）：
// - 顺序 await 三次 = 三次延迟相加
// - Promise.all 同时发 = 取最长那一个
// 这是 OpenAI 官方 latency 7 原则里的 #5 「Parallelize」。

const client = new OpenAI();

const TEXT = "今天发的快递居然把我的猫罐头压扁了，太离谱了！";

async function classify(prompt: string): Promise<string> {
  const resp = await client.responses.create({
    model: "gpt-5.4-nano",
    instructions: prompt,
    input: TEXT,
  });
  return resp.output_text.trim();
}

const TASKS = {
  sentiment: "用一个词判断这段话的情感（正面/负面/中性）。只输出那个词。",
  language: "判断这段话的主要语言。只输出语言名（中文/English/...）。",
  topic: "用 ≤5 个汉字给这段话打主题标签。",
};

async function sequential() {
  const start = performance.now();
  const sentiment = await classify(TASKS.sentiment);
  const language = await classify(TASKS.language);
  const topic = await classify(TASKS.topic);
  return { total: performance.now() - start, sentiment, language, topic };
}

async function parallel() {
  const start = performance.now();
  const [sentiment, language, topic] = await Promise.all([
    classify(TASKS.sentiment),
    classify(TASKS.language),
    classify(TASKS.topic),
  ]);
  return { total: performance.now() - start, sentiment, language, topic };
}

async function main() {
  console.log("========== 顺序 vs 并行 ==========\n");

  console.log("❌ 顺序 await 三次:");
  const s = await sequential();
  console.log(`  Total: ${s.total.toFixed(0)} ms`);
  console.log(`  ${s.sentiment} / ${s.language} / ${s.topic}`);
  console.log("");

  console.log("✅ Promise.all 同时发三次:");
  const p = await parallel();
  console.log(`  Total: ${p.total.toFixed(0)} ms`);
  console.log(`  ${p.sentiment} / ${p.language} / ${p.topic}`);
  console.log("");

  const speedup = s.total / p.total;
  console.log(`📌 并行版本快了约 ${speedup.toFixed(1)}×`);
  console.log("📌 适用前提：三个任务互相独立，不依赖彼此的输出。");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
