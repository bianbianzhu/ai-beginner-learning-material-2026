/**
 * Lesson 18 · Compaction (Part A) — 手动压缩 /responses/compact
 * -----------------------------------------------------------
 * 目标：用 `client.responses.compact()` 显式压缩一段历史，
 *       把长对话压成一个加密的 compaction item，传给下一次请求。
 *
 * 2026 关键点：
 *   - `/responses/compact` 是独立的端点，完全无状态、ZDR 友好
 *   - 输入：完整历史；输出：压缩后的 context window（仍包含保留的 items + 1 个 compaction item）
 *   - 返回的 `compaction` item 是**加密**的，人不可读，只有模型能理解
 *   - 不要修剪 /responses/compact 的输出，直接原样传给下一次 responses.create
 *
 * 运行：pnpm l18:manual
 */

import "dotenv/config";
import OpenAI from "openai";
import type { ResponseInputItem } from "openai/resources/responses/responses";

const client = new OpenAI();
const MODEL = "gpt-5.4-nano";

async function main() {
  console.log("=== Lesson 18 · Manual Compaction 演示 ===\n");

  // ── 1. 构造一段"长历史"（多轮对话） ──
  console.log("--- Step 1: 构造一段 10 轮对话历史 ---");
  const history: ResponseInputItem[] = [];
  for (let i = 1; i <= 10; i++) {
    history.push({
      role: "user",
      content: `第 ${i} 轮：我想知道编号 ${i} 的一些事情。请给我一段 50 字左右的介绍。${"填充内容。".repeat(30)}`,
    });
    history.push({
      role: "assistant",
      content: `第 ${i} 轮回答：关于编号 ${i}，它在数学上是一个常见的正整数……${"这里是回答内容。".repeat(30)}`,
    });
  }
  console.log(`  history items 数量: ${history.length}\n`);

  // ── 2. 调用 compact 端点压缩历史 ──
  console.log("--- Step 2: 调用 client.responses.compact() ---");
  const compacted = await client.responses.compact({
    model: MODEL,
    input: history,
  });
  console.log(`  compacted.id: ${compacted.id}`);
  console.log(`  compacted.object: ${compacted.object}`);
  console.log(`  compacted.output 数量: ${compacted.output.length}`);
  console.log(`  compacted.usage:`, JSON.stringify(compacted.usage, null, 2));

  // 检查返回的 output 里是否有 compaction item
  const compactionItems = compacted.output.filter((item) => item.type === "compaction");
  console.log(`  找到 compaction item 数量: ${compactionItems.length}`);
  if (compactionItems.length > 0) {
    const first = compactionItems[0] as { id: string; type: string; encrypted_content: string };
    console.log(`  compaction.id: ${first.id}`);
    console.log(`  compaction.encrypted_content (前 80 字符): ${first.encrypted_content.slice(0, 80)}...`);
    console.log(`  → 这段加密内容人看不懂，但模型能理解上下文`);
  }
  console.log("");

  // ── 3. 用压缩后的 output 作为下一次请求的 input ──
  console.log("--- Step 3: 把压缩后的 output 作为下一次请求 ---");
  const nextInput: ResponseInputItem[] = [
    ...(compacted.output as ResponseInputItem[]), // 原样传入，不要修剪
    { role: "user", content: "根据我们之前的讨论，请用一句话总结：我们聊了多少轮？每轮是关于什么的？" },
  ];
  console.log(`  下一次 input 数量: ${nextInput.length}（vs 原始 ${history.length}）`);

  const response = await client.responses.create({
    model: MODEL,
    input: nextInput,
  });
  console.log(`  AI:   ${response.output_text.slice(0, 200)}${response.output_text.length > 200 ? "..." : ""}`);
  console.log(`  [input_tokens: ${response.usage?.input_tokens}]`);
  console.log("");

  // ── 4. 对比：直接用原始 history（不压缩）──
  console.log("--- Step 4: 对比 —— 直接用原始 history（不压缩）---");
  const response2 = await client.responses.create({
    model: MODEL,
    input: [
      ...history,
      { role: "user", content: "根据我们之前的讨论，请用一句话总结：我们聊了多少轮？每轮是关于什么的？" },
    ],
  });
  console.log(`  AI:   ${response2.output_text.slice(0, 200)}${response2.output_text.length > 200 ? "..." : ""}`);
  console.log(`  [input_tokens: ${response2.usage?.input_tokens}]`);
  console.log("");

  console.log("=== 结论 ===");
  console.log(`压缩前 input tokens: ${response2.usage?.input_tokens}`);
  console.log(`压缩后 input tokens: ${response.usage?.input_tokens}`);
  console.log("压缩是**显式调用**，你来决定何时触发。下一课演示自动模式。");
}

main().catch((err) => {
  console.error("Something went wrong:", err);
  process.exit(1);
});
