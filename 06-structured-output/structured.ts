/**
 * Lesson 6 · Structured Output（用 zod 约束 AI 输出的 JSON 格式）
 * -----------------------------------------------------------
 * 目标：让 AI 直接返回**可以落库**的结构化数据（不是一段可能含乱七八糟格式的文字）。
 *
 * 2026 关键点：
 *   - API: `client.responses.parse({ ..., text: { format: zodTextFormat(schema, name) } })`
 *   - 用 zod 定义 schema → SDK 自动转成 JSON Schema + strict mode
 *   - 拿到 `response.output_parsed`，**TypeScript 类型 100% 安全**
 *   - `strict: true` 保证不缺字段、不多字段、不违反 enum
 *
 * 运行：pnpm l6
 */

import "dotenv/config";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

const client = new OpenAI();

// 1. 用 zod 定义你想要的"课程卡片"结构
const CourseCard = z.object({
  title: z.string().describe("Short, catchy course title"),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  estimatedMinutes: z.number().int().positive(),
  keyPoints: z.array(z.string()).min(3).max(5),
  pitfalls: z.array(z.string()).min(1).max(3),
});

// 2. 从 zod 推出 TS 类型 —— 下面用得上
type CourseCard = z.infer<typeof CourseCard>;

async function main() {
  const response = await client.responses.parse({
    model: "gpt-5.4-nano",
    instructions:
      "You are a curriculum designer. Always return a course card strictly matching the provided schema.",
    input: "Topic: 'How to call the OpenAI Responses API from TypeScript'",
    // 核心：告诉 API 输出必须符合这个 zod schema
    text: {
      format: zodTextFormat(CourseCard, "course_card"),
    },
  });

  // 3. output_parsed 已经是类型安全的对象了（不是字符串！）
  const card: CourseCard | null = response.output_parsed;

  if (!card) {
    console.error("Model refused or parse failed. Raw output:");
    console.log(response.output_text);
    return;
  }

  console.log("========== Parsed Course Card ==========");
  console.log(card);

  console.log("\n========== TS 类型安全演示 ==========");
  console.log("标题 :", card.title);
  console.log("难度 :", card.difficulty);
  console.log("时长 :", card.estimatedMinutes, "min");
  console.log("要点 :");
  card.keyPoints.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
  console.log("坑  :");
  card.pitfalls.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));

  console.log("\n========== usage ==========");
  console.log(response.usage);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
