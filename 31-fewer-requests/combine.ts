import "dotenv/config";
import OpenAI from "openai";

// Lesson 31 · combine.ts
// 别把能 1 次完成的事拆成 2 次：每次 round-trip 都有固定开销。
// 这里把「改写问题为搜索 query」+「回答问题」从 2 个顺序请求合并为 1 个 JSON 输出。

const client = new OpenAI();

const HISTORY = [
  { role: "user" as const, content: "你们最近的退款政策是什么？" },
  { role: "assistant" as const, content: "7 天内无理由退款，原路退回。" },
  { role: "user" as const, content: "那它包多久？" },
];

async function badSplit() {
  const start = performance.now();

  const rewrite = await client.responses.create({
    model: "gpt-5.4-nano",
    instructions:
      "把用户最新一句话改写成自包含的搜索 query。只输出 query 本身，不要任何解释。",
    input: HISTORY.map((m) => `${m.role}: ${m.content}`).join("\n"),
  });
  const query = rewrite.output_text.trim();

  const answer = await client.responses.create({
    model: "gpt-5.4-nano",
    instructions: "用一句话回答下面的问题。",
    input: query,
  });

  const total = performance.now() - start;
  return { total, query, answer: answer.output_text };
}

async function goodCombined() {
  const start = performance.now();

  const resp = await client.responses.create({
    model: "gpt-5.4-nano",
    instructions: `把用户最新一句话改写成自包含搜索 query，并直接回答它。
按 JSON 返回：{"query": "...", "answer": "..."}。不要任何额外文字。`,
    input: HISTORY.map((m) => `${m.role}: ${m.content}`).join("\n"),
  });

  const total = performance.now() - start;
  return { total, raw: resp.output_text };
}

async function main() {
  console.log("========== 拆开 vs 合并 ==========\n");

  console.log("❌ 2 次顺序调用:");
  const bad = await badSplit();
  console.log(`  Total: ${bad.total.toFixed(0)} ms`);
  console.log(`  query:  ${bad.query}`);
  console.log(`  answer: ${bad.answer}`);
  console.log("");

  console.log("✅ 1 次合并调用 (JSON 输出):");
  const good = await goodCombined();
  console.log(`  Total: ${good.total.toFixed(0)} ms`);
  console.log(`  raw:    ${good.raw.slice(0, 120)}`);
  console.log("");

  const speedup = bad.total / good.total;
  console.log(`📌 合并版本快了约 ${speedup.toFixed(1)}× (省了 1 次 round-trip)`);
  console.log("📌 注意：能合并的前提是模型一次能想清楚两件事。复杂任务别硬合并。");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
