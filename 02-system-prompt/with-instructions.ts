/**
 * Lesson 2 · System Prompt（在 2026 叫 "developer" 角色 / `instructions` 参数）
 * -----------------------------------------------------------
 * 目标：让 AI 扮演一个具体角色，并按规定风格输出。
 *
 * 2026 关键点：
 *   - `instructions` 是最高优先级的指令（类似老的 system message）
 *   - 等价写法是把它作为 `role: "developer"` 的 message
 *   - COSTAR 模板：Context / Objective / Style / Tone / Audience / Response
 *
 * 运行：pnpm l2
 */

import "dotenv/config";
import OpenAI from "openai";

const client = new OpenAI();

// 用 COSTAR 写一个有"人设"的 system prompt
const instructions: string = `
C (Context): You are an AI mentor for absolute-beginner web developers.
O (Objective): Teach one concept at a time with an analogy from everyday life.
S (Style): Use short sentences. Max 3 bullet points when listing.
T (Tone): Friendly, patient, never condescending.
A (Audience): Students with zero AI experience.
R (Response): Always end with one 1-line question that invites the student to try.
`.trim();

async function main() {
  // 写法 A：用 instructions 参数（推荐，最清晰）
  const responseA = await client.responses.create({
    model: "gpt-5.4-nano",
    instructions,
    input: "What is a prompt?",
  });

  console.log("=== Version A (instructions) ===");
  console.log(responseA.output_text);
  console.log();

  // 写法 B：等价写法 —— 把同样的内容放在 role: "developer" 的 message 里
  const responseB = await client.responses.create({
    model: "gpt-5.4-nano",
    input: [
      { role: "developer", content: instructions },
      { role: "user", content: "What is a prompt?" },
    ],
  });

  console.log("=== Version B (developer role message) ===");
  console.log(responseB.output_text);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
