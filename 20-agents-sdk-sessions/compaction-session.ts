/**
 * Lesson 20 · Agents SDK (Part C) — OpenAIResponsesCompactionSession
 * -----------------------------------------------------------
 * 目标：用 OpenAIResponsesCompactionSession 给任意 Session "套一层"
 *       自动压缩逻辑 —— 当 history 变长时自动调用 /responses/compact。
 *
 * 2026 关键点：
 *   - 这是一个 **decorator**：需要一个 underlyingSession（比如 MemorySession）
 *   - 每轮结束后判断是否触发压缩（默认阈值 10 个非 user items）
 *   - 可自定义 `shouldTriggerCompaction` 做更细的决策
 *   - 底层调用第 18 课的 responses.compact
 *
 * 运行：pnpm l20:compact
 */

import "dotenv/config";
import {
  Agent,
  MemorySession,
  OpenAIResponsesCompactionSession,
  run,
} from "@openai/agents";

async function main() {
  console.log("=== Lesson 20 · OpenAIResponsesCompactionSession 演示 ===\n");

  const agent = new Agent({
    name: "FriendlyAssistant",
    model: "gpt-5.4-nano",
    instructions: "你是一个友好的中文助手，回答简短。",
  });

  // 1. 创建 compaction session：套在一个 MemorySession 上
  const session = new OpenAIResponsesCompactionSession({
    model: "gpt-5.4-nano",
    underlyingSession: new MemorySession(),
    // 自定义触发条件：只要有 3 个候选 items 就触发（演示用，正常值应该更高）
    shouldTriggerCompaction: ({ compactionCandidateItems }) => {
      return compactionCandidateItems.length >= 3;
    },
  });

  // 2. 跑一系列轮次，观察压缩触发
  const questions = [
    "你好，我叫 Eve，我在东京做游戏开发。",
    "我最喜欢的游戏类型是 roguelike。",
    "我正在做一款关于海洋探险的游戏。",
    "这个海洋游戏我想用 Unity 还是 Unreal？",
    "能帮我一句话总结：我是谁、在哪、做什么、喜欢什么游戏吗？",
  ];

  for (let i = 0; i < questions.length; i++) {
    console.log(`--- Turn ${i + 1} ---`);
    console.log(`User: ${questions[i]}`);

    const result = await run(agent, questions[i], { session });
    console.log(`AI:   ${result.finalOutput}`);

    const items = await session.getItems();
    console.log(`  [session items: ${items.length}]`);

    // 展示是否含 compaction item
    const compactionCount = items.filter((item) => {
      const obj = item as { type?: string };
      return obj.type === "compaction";
    }).length;
    if (compactionCount > 0) {
      console.log(`  [✓ 检测到 ${compactionCount} 个 compaction item]`);
    }
    console.log("");
  }

  // 3. 手动强制触发一次压缩
  console.log("--- 手动强制压缩 runCompaction({ force: true }) ---");
  const result = await session.runCompaction({ force: true });
  console.log(`  runCompaction 结果: ${result ? "执行了压缩" : "未执行（可能没有可压缩的 items）"}`);
  if (result) {
    console.log(`  usage:`, JSON.stringify(result.usage, null, 2));
  }

  const finalItems = await session.getItems();
  console.log(`  压缩后 items 数量: ${finalItems.length}`);
  const finalCompactionCount = finalItems.filter((item) => {
    const obj = item as { type?: string };
    return obj.type === "compaction";
  }).length;
  console.log(`  压缩后 compaction items: ${finalCompactionCount}\n`);

  console.log("=== 要点总结 ===");
  console.log("1. OpenAIResponsesCompactionSession 是 decorator，必须传 underlyingSession");
  console.log("2. 默认触发阈值是 10 个候选 items，可用 shouldTriggerCompaction 自定义");
  console.log("3. 底层调用 responses.compact（就是第 18 课）");
  console.log("4. runCompaction({ force: true }) 可手动强制触发");
}

main().catch((err) => {
  console.error("Something went wrong:", err);
  process.exit(1);
});
