/**
 * Lesson 3 · Short-Term Memory（用数组手动管理对话历史）
 * -----------------------------------------------------------
 * 目标：让 AI "记得" 上一句说了什么。
 *
 * 核心洞察：
 *   Responses API 的每次请求都是 **无状态** 的 ——
 *   你想让它有记忆，就必须在 `input` 里把历史消息全部传进去。
 *
 *   History 就是一个普通数组：[user, assistant, user, assistant, ...]
 *
 * 2026 关键点：
 *   - 有两种"有状态"的自动化方案（Conversations API / previous_response_id），
 *     但手动数组永远是**基础**。Lesson 11、13 都会用到这个模式。
 *
 * 运行：pnpm l3
 */

import "dotenv/config";
import OpenAI from "openai";

const client = new OpenAI();

// history 的类型就是 Responses API 接受的 input item 数组
type HistoryItem = { role: "user" | "assistant" | "developer"; content: string };

async function ask(history: HistoryItem[], userMessage: string) {
  // 1. 把用户的新一轮话塞进历史
  history.push({ role: "user", content: userMessage });

  // 2. 把"整段历史"作为 input 传给模型
  const response = await client.responses.create({
    model: "gpt-5.4-nano",
    input: history,
  });

  const reply = response.output_text;

  // 3. 把 AI 的回答也塞进历史 —— 下一轮它就"记得"了
  history.push({ role: "assistant", content: reply });

  return reply;
}

async function main() {
  const history: HistoryItem[] = [
    {
      role: "developer",
      content: "You are a playful assistant. Keep answers under 2 sentences.",
    },
  ];

  // 模拟一个经典 knock-knock 笑话对话
  console.log("User:", "Knock knock.");
  console.log("AI:  ", await ask(history, "Knock knock."));
  console.log();

  console.log("User:", "Orange.");
  console.log("AI:  ", await ask(history, "Orange."));
  console.log();

  // 关键测试：问它 "我刚才说的第一句是什么？"
  // 如果它答得出 "Knock knock."，说明短期记忆生效了。
  console.log("User:", "What was the very first thing I said?");
  console.log("AI:  ", await ask(history, "What was the very first thing I said?"));
  console.log();

  console.log("--- Final history length:", history.length, "items ---");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
