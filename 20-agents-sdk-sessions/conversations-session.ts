/**
 * Lesson 20 · Agents SDK (Part B) — OpenAIConversationsSession
 * -----------------------------------------------------------
 * 目标：用 OpenAIConversationsSession 让对话历史存在 OpenAI 服务端，
 *       跨进程、跨设备、无 30 天 TTL 持久化。
 *
 * 2026 关键点：
 *   - 内部基于第 16 课的 Conversations API
 *   - 首次调用时会自动创建 Conversation；拿到 sessionId 就是 conv_xxx
 *   - 下次传入同一个 conversationId 即可继续对话
 *   - 对比 MemorySession：重启程序也不会丢历史
 *
 * 运行：pnpm l20:conv                      # 新对话
 *      pnpm l20:conv <conversationId>     # 继续已有对话
 */

import "dotenv/config";
import { Agent, run, OpenAIConversationsSession } from "@openai/agents";

async function main() {
  console.log("=== Lesson 20 · OpenAIConversationsSession 演示 ===\n");

  // 1. 创建 Agent
  const agent = new Agent({
    name: "FriendlyAssistant",
    model: "gpt-5.4-nano",
    instructions: "你是一个友好的中文助手，回答简短。",
  });

  // 2. 创建 OpenAIConversationsSession（可选传入已有 conversationId 续聊）
  const argId = process.argv[2];
  const session = new OpenAIConversationsSession({
    conversationId: argId, // 传 undefined 则首次 run 时自动创建
  });

  if (argId) {
    console.log(`继续已有对话: ${argId}\n`);
  } else {
    console.log(`将自动创建新对话\n`);
  }

  // 3. 第一轮
  console.log("--- Turn 1 ---");
  const r1 = await run(
    agent,
    argId
      ? "我们之前聊到哪了？帮我总结一下。"
      : "你好，我叫 Dana，我在墨尔本做 AI 工程师。",
    { session }
  );
  console.log(`AI: ${r1.finalOutput}\n`);

  // 4. 拿到（或首次创建）的 conversationId
  const conversationId = await session.getSessionId();
  console.log(`sessionId (conv_xxx): ${conversationId}\n`);

  // 5. 第二轮
  console.log("--- Turn 2 ---");
  const r2 = await run(agent, "再问一下：我叫什么？在哪个城市？", { session });
  console.log(`AI: ${r2.finalOutput}\n`);

  // 6. 查看 Session 里存了什么
  console.log("--- Session 里的 items ---");
  const items = await session.getItems();
  console.log(`  items 数量: ${items.length}`);
  items.forEach((item, i) => {
    const preview = JSON.stringify(item).slice(0, 100);
    console.log(`  [${i}] ${preview}${JSON.stringify(item).length > 100 ? "..." : ""}`);
  });
  console.log("");

  console.log("=== 要点总结 ===");
  console.log("1. 底层是第 16 课的 Conversations API（conv_xxx）");
  console.log("2. 程序重启后，用同一个 conversationId 即可续聊");
  console.log(`3. 下次继续：pnpm l20:conv ${conversationId}`);
  console.log("4. 无 30 天 TTL，数据长期保留（不需要了记得调用 clearSession 或 delete）");
}

main().catch((err) => {
  console.error("Something went wrong:", err);
  process.exit(1);
});
