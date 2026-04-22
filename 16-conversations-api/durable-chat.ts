/**
 * Lesson 16 · Conversations API — 持久化对话
 * -----------------------------------------------------------
 * 目标：用 Conversations API 创建一个持久化的对话对象，
 *       无 30 天 TTL，可跨会话、跨设备共享。
 *
 * 2026 关键点：
 *   - `client.conversations.create()` 创建一个 `conv_xxx` 对象
 *   - 传 `conversation: conv.id` 给 `responses.create()` 即可自动持久化
 *   - 对话内容无 30 天 TTL（不像 `previous_response_id`）
 *   - 支持 CRUD：列出 items、检索对话、删除对话
 *
 * 运行：pnpm l16
 */

import "dotenv/config";
import OpenAI from "openai";

const client = new OpenAI();
const MODEL = "gpt-5.4-nano";

async function main() {
  console.log("=== Lesson 16 · Conversations API 演示 ===\n");

  // ── 1. 创建对话对象 ──
  console.log("--- Step 1: 创建 Conversation 对象 ---");
  const conversation = await client.conversations.create();
  console.log(`  conversation.id: ${conversation.id}`);
  console.log(`  object: ${conversation.object}\n`);

  // ── 2. 第 1 轮对话：绑定到 conversation ──
  console.log("--- Step 2: 第 1 轮对话 ---");
  const r1 = await client.responses.create({
    model: MODEL,
    instructions: "你是一个友好的中文助手，回答简短。",
    input: [{ role: "user", content: "你好，我叫 Alice，我是全栈工程师。" }],
    conversation: conversation.id, // 绑定到对话
  });
  console.log(`User: 你好，我叫 Alice，我是全栈工程师。`);
  console.log(`AI:   ${r1.output_text}`);
  console.log(`  [input_tokens: ${r1.usage?.input_tokens}]\n`);

  // ── 3. 第 2 轮：继续同一个 conversation ──
  console.log("--- Step 3: 第 2 轮对话 ---");
  const r2 = await client.responses.create({
    model: MODEL,
    input: [{ role: "user", content: "我叫什么？做什么工作？" }],
    conversation: conversation.id,
  });
  console.log(`User: 我叫什么？做什么工作？`);
  console.log(`AI:   ${r2.output_text}`);
  console.log(`  [input_tokens: ${r2.usage?.input_tokens}]\n`);

  // ── 4. 列出对话中的所有 items ──
  console.log("--- Step 4: 列出对话中的 items ---");
  const items = await client.conversations.items.list(conversation.id);
  let itemCount = 0;
  for await (const item of items) {
    itemCount++;
    // item 是 ConversationItem（判别联合类型），只有 type === "message" 时才有 role/content
    const role = item.type === "message" ? item.role : "(n/a)";
    let preview = `[${item.type}]`;
    if (item.type === "message") {
      const firstContent = item.content?.[0];
      if (firstContent?.type === "output_text") {
        preview = firstContent.text?.slice(0, 50) + "...";
      } else if (firstContent?.type === "input_text") {
        preview = firstContent.text?.slice(0, 50) + "...";
      }
    }
    console.log(`  ${itemCount}. role=${role}, type=${item.type}, preview=${preview}`);
  }
  console.log(`  共 ${itemCount} 条 items\n`);

  // ── 5. 检索对话信息 ──
  console.log("--- Step 5: 检索对话信息 ---");
  const retrieved = await client.conversations.retrieve(conversation.id);
  console.log(`  id: ${retrieved.id}`);
  console.log(`  object: ${retrieved.object}`);
  console.log(`  created_at: ${new Date(retrieved.created_at * 1000).toISOString()}\n`);

  // ── 6. 清理：删除对话 ──
  console.log("--- Step 6: 删除对话 ---");
  const deleted = await client.conversations.delete(conversation.id);
  console.log(`  deleted: ${JSON.stringify(deleted)}\n`);

  console.log("=== 要点总结 ===");
  console.log("1. conversations.create() → 拿到 conv_xxx ID");
  console.log("2. responses.create({ conversation: id }) → 自动持久化");
  console.log("3. 无 30 天 TTL（不像 previous_response_id）");
  console.log("4. 支持 list items / retrieve / delete 操作");
}

main().catch((err) => {
  console.error("Something went wrong:", err);
  process.exit(1);
});
