/**
 * Lesson 18 · Compaction (Part B) — 自动压缩 context_management
 * -----------------------------------------------------------
 * 目标：用 `context_management: [{ type: "compaction", compact_threshold }]` 让服务端
 *       在 token 数跨过阈值时自动触发压缩，无需手动调用 /responses/compact。
 *
 * 2026 关键点：
 *   - `context_management` 是 responses.create 的参数（不是 compact 端点）
 *   - 达到 `compact_threshold` 时，服务端在流中触发一次压缩 pass
 *   - 返回的 output 里会自动包含 compaction item
 *   - 下一轮用 previous_response_id 或把 output 加到 input 里继续
 *
 * 运行：pnpm l18:auto
 */

import "dotenv/config";
import OpenAI from "openai";
import type { ResponseInputItem } from "openai/resources/responses/responses";

const client = new OpenAI();
const MODEL = "gpt-5.4-nano";

async function main() {
  console.log("=== Lesson 18 · Auto Compaction 演示 ===\n");

  // ── 1. 构造一段"长历史" ──
  console.log("--- Step 1: 构造 15 轮对话历史 ---");
  const history: ResponseInputItem[] = [];
  for (let i = 1; i <= 15; i++) {
    history.push({
      role: "user",
      content: `第 ${i} 轮：请告诉我一个关于编号 ${i} 的有趣事实。${"填充。".repeat(40)}`,
    });
    history.push({
      role: "assistant",
      content: `第 ${i} 轮回答：编号 ${i} 是一个有意思的整数。${"回答内容。".repeat(40)}`,
    });
  }
  // 追加本轮的新用户问题
  history.push({ role: "user", content: "根据我们之前的讨论，我们聊了多少轮？" });
  console.log(`  history items 数量: ${history.length}\n`);

  // ── 2. 发起请求，开启自动压缩 ──
  console.log("--- Step 2: 开启 context_management 自动压缩 ---");
  console.log("  context_management: [{ type: 'compaction', compact_threshold: 2000 }]\n");

  const response = await client.responses.create({
    model: MODEL,
    input: history,
    store: false, // ZDR 友好：不在服务端存储
    context_management: [{ type: "compaction", compact_threshold: 2000 }],
  });

  // ── 3. 分析 output 中的 items ──
  console.log("--- Step 3: 分析 response.output ---");
  console.log(`  总 output items 数量: ${response.output.length}`);
  const typesByCount: Record<string, number> = {};
  for (const item of response.output) {
    typesByCount[item.type] = (typesByCount[item.type] || 0) + 1;
  }
  console.log(`  types:`, typesByCount);

  const compactionItems = response.output.filter((item) => item.type === "compaction");
  if (compactionItems.length > 0) {
    const first = compactionItems[0] as {
      id: string;
      type: string;
      encrypted_content: string;
    };
    console.log(`  ✓ 检测到 compaction item（服务端自动压缩已触发）`);
    console.log(`    id: ${first.id}`);
    console.log(`    encrypted_content (前 60 字符): ${first.encrypted_content.slice(0, 60)}...`);
  } else {
    console.log(`  ✗ 没有 compaction item（阈值未触发或 input 太小）`);
  }
  console.log("");

  // ── 4. 查看最终的 text 回答 ──
  console.log("--- Step 4: 最终回答 ---");
  console.log(`  AI:   ${response.output_text}`);
  console.log(`  [usage: ${JSON.stringify(response.usage)}]`);
  console.log("");

  // ── 5. 继续下一轮：演示如何延续 ──
  console.log("--- Step 5: 延续对话（stateless 链式）---");
  console.log("  思路：把压缩后的 output 附加到原 input（或只保留 compaction item）");

  // 简化做法：保留 compaction item + 原输入尾部 + 新问题
  const nextInput: ResponseInputItem[] = [
    ...(response.output as ResponseInputItem[]),
    { role: "user", content: "请一句话总结我们的讨论主题。" },
  ];

  const r2 = await client.responses.create({
    model: MODEL,
    input: nextInput,
    store: false,
    context_management: [{ type: "compaction", compact_threshold: 2000 }],
  });
  console.log(`  AI:   ${r2.output_text}`);
  console.log(`  [input_tokens: ${r2.usage?.input_tokens}]\n`);

  console.log("=== 要点总结 ===");
  console.log("1. context_management 是 responses.create 的参数");
  console.log("2. 超过 compact_threshold 自动触发，无需手动调用 compact 端点");
  console.log("3. 官方默认阈值是 200000；示例用 2000 只是为了演示触发");
  console.log("4. store: false → ZDR 友好（不在服务端存储请求/响应）");
}

main().catch((err) => {
  console.error("Something went wrong:", err);
  process.exit(1);
});
