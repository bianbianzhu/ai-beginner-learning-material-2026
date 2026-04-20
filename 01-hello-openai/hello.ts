/**
 * Lesson 1 · Hello OpenAI
 * -----------------------------------------------------------
 * 目标：用一行 API 调用让 AI 说句话。
 *
 * 2026 关键点：
 *   - 用官方 `openai` SDK（v6）
 *   - 用 **Responses API**（`openai.responses.create`），不是旧的 chat.completions
 *   - SDK 自动从环境变量 OPENAI_API_KEY 读取 key
 *
 * 运行：pnpm l1
 */

import "dotenv/config";
import OpenAI from "openai";

const client = new OpenAI(); // 自动读取 process.env.OPENAI_API_KEY

async function main() {
  const response = await client.responses.create({
    model: "gpt-5.4-nano",
    input: "Say hello to a student learning AI in 2026, in exactly one sentence.",
  });

  // output_text 是 SDK 的便捷字段 —— 把所有文本 output 拼成一个字符串
  console.log("AI says:", response.output_text);
}

main().catch((err) => {
  console.error("Something went wrong:", err);
  process.exit(1);
});
