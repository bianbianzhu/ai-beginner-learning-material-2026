/**
 * Lesson 17 · Truncation — 自动截断（安全网）
 * -----------------------------------------------------------
 * 目标：理解 `truncation: "auto"` 参数的作用：
 *       当总 tokens 超出模型上下文窗口时，自动丢弃旧消息，避免 400 错误。
 *
 * 2026 关键点：
 *   - `truncation: "disabled"` —— 默认值。超限时返回 400 错误
 *   - `truncation: "auto"`     —— 自动丢弃旧的 input items 以适应窗口
 *   - 这是**硬截断**，不做语义压缩（和第 18 课 compaction 不同）
 *   - 推荐：不确定对话长度的场景，开启 "auto" 作为兜底
 *
 * 运行：pnpm l17
 */

import "dotenv/config";
import OpenAI from "openai";
import type { ResponseInputItem } from "openai/resources/responses/responses";

const client = new OpenAI();
const MODEL = "gpt-5.4-nano";

async function main() {
  console.log("=== Lesson 17 · Truncation 演示 ===\n");

  // ── 1. 默认行为：truncation 未设置（等价于 "disabled"）──
  console.log("--- 场景 1: truncation 未设置（默认 = 'disabled'）---");
  const r1 = await client.responses.create({
    model: MODEL,
    input: "用一句话解释 HTTP 状态码 404。",
    // 没有 truncation 参数，默认为 disabled
  });
  console.log(`AI:   ${r1.output_text}`);
  console.log(`  [input_tokens: ${r1.usage?.input_tokens}]\n`);

  // ── 2. 显式启用 truncation: "auto" ──
  console.log("--- 场景 2: truncation: 'auto' ---");
  const r2 = await client.responses.create({
    model: MODEL,
    input: "用一句话解释 HTTP 状态码 500。",
    truncation: "auto", // 安全网：超限时自动丢弃旧消息
  });
  console.log(`AI:   ${r2.output_text}`);
  console.log(`  [input_tokens: ${r2.usage?.input_tokens}]\n`);

  // ── 3. 构造一个"超长历史"来观察 input_tokens ──
  console.log("--- 场景 3: 长 history + truncation: 'auto' ---");
  const longHistory: ResponseInputItem[] = [];

  // 模拟 30 轮对话，每轮塞入一段长文本
  for (let i = 1; i <= 30; i++) {
    longHistory.push({
      role: "user",
      content: `第 ${i} 轮问题：请告诉我一个关于编号 ${i} 的趣事。${"这是填充内容。".repeat(50)}`,
    });
    longHistory.push({
      role: "assistant",
      content: `第 ${i} 轮回答：编号 ${i} 是一个有趣的数字。${"这里是回答内容。".repeat(50)}`,
    });
  }
  longHistory.push({ role: "user", content: "回顾一下：我们第 1 轮聊了什么？" });

  const r3 = await client.responses.create({
    model: MODEL,
    input: longHistory,
    truncation: "auto", // 关键：防止超限
  });
  console.log(`AI:   ${r3.output_text.slice(0, 200)}${r3.output_text.length > 200 ? "..." : ""}`);
  console.log(`  [input_tokens: ${r3.usage?.input_tokens}] ← 总计 input tokens`);
  console.log(`  [history items 数量: ${longHistory.length}]\n`);

  // ── 4. 不同 truncation 值的对比表 ──
  console.log("=== truncation 参数对照表 ===");
  console.log("| 值          | 行为                                            |");
  console.log("|-------------|-------------------------------------------------|");
  console.log("| 'disabled'  | 默认。超限时返回 400 错误（context_length_exceeded）|");
  console.log("| 'auto'      | 超限时自动丢弃最早的 input items 以适应窗口       |");
  console.log("| null        | 等价于 'disabled'                                |");
  console.log("");
  console.log("要点：");
  console.log("1. 'auto' 是硬截断，不做语义压缩，丢的内容就是丢了");
  console.log("2. 如果需要智能压缩 → 用第 18 课的 compaction");
  console.log("3. 推荐：不确定对话长度的生产场景，开启 'auto' 作为兜底");
}

main().catch((err) => {
  console.error("Something went wrong:", err);
  process.exit(1);
});
