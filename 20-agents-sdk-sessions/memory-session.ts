/**
 * Lesson 20 · Agents SDK (Part A) — MemorySession
 * -----------------------------------------------------------
 * 目标：用 `@openai/agents` 的 `MemorySession`，把"维护 history 数组"
 *       这件事交给 SDK 的 Session 抽象。
 *
 * 2026 关键点：
 *   - MemorySession 把对话历史存在"进程内存"里，程序退出就没了
 *   - 最适合 demo 和测试（不推荐生产）
 *   - 配合 `run(agent, input, { session })` 自动串联上下文
 *
 * 运行：pnpm l20:memory
 */

import "dotenv/config";
import { Agent, MemorySession, run } from "@openai/agents";

async function main() {
  console.log("=== Lesson 20 · MemorySession 演示 ===\n");

  // 1. 创建一个 Agent（定义 AI 的人设、模型等）
  const agent = new Agent({
    name: "FriendlyAssistant",
    model: "gpt-5.4-nano",
    instructions: "你是一个友好的中文助手，回答简短。",
  });

  // 2. 创建一个 MemorySession（进程内存中的会话）
  const session = new MemorySession();
  console.log(`session.getSessionId: ${await session.getSessionId()}\n`);

  // 3. 第一轮
  console.log("--- Turn 1 ---");
  const r1 = await run(agent, "你好，我叫 Charlie，我是自由职业设计师。", {
    session,
  });
  console.log(`User: 你好，我叫 Charlie，我是自由职业设计师。`);
  console.log(`AI:   ${r1.finalOutput}\n`);

  // 4. 第二轮（Session 会自动拼上 history）
  console.log("--- Turn 2 ---");
  const r2 = await run(agent, "我叫什么？做什么工作？", { session });
  console.log(`User: 我叫什么？做什么工作？`);
  console.log(`AI:   ${r2.finalOutput}\n`);

  // 5. 查看 Session 里存了什么
  console.log("--- Session 里的 items ---");
  const items = await session.getItems();
  console.log(`  items 数量: ${items.length}`);
  items.forEach((item, i) => {
    const preview = JSON.stringify(item).slice(0, 100);
    console.log(`  [${i}] ${preview}${JSON.stringify(item).length > 100 ? "..." : ""}`);
  });
  console.log("");

  // 6. 清空 Session
  console.log("--- 清空 Session ---");
  await session.clearSession();
  const itemsAfterClear = await session.getItems();
  console.log(`  clearSession() 后 items 数量: ${itemsAfterClear.length}\n`);

  // 7. 清空后再问同样的问题（AI 应该不记得了）
  console.log("--- Turn 3 (清空后) ---");
  const r3 = await run(agent, "我叫什么？", { session });
  console.log(`User: 我叫什么？`);
  console.log(`AI:   ${r3.finalOutput}\n`);

  console.log("=== 要点总结 ===");
  console.log("1. new MemorySession() → 进程内存中的会话对象");
  console.log("2. run(agent, input, { session }) → SDK 自动维护 history");
  console.log("3. session.clearSession() → 清空所有历史");
  console.log("4. 程序退出 → 所有内容丢失（生产用请换 ConversationsSession）");
}

main().catch((err) => {
  console.error("Something went wrong:", err);
  process.exit(1);
});
