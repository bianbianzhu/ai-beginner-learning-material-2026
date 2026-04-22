/**
 * Lesson 15 · previous_response_id — 服务端对话链
 * -----------------------------------------------------------
 * 目标：用 `previous_response_id` 实现多轮对话，
 *       不再需要自己维护 history 数组。
 *
 * 2026 关键点：
 *   - Responses API 可以用 `store: true` 把响应存在 OpenAI 服务端（保留 30 天）
 *   - 下一次请求只需传 `previous_response_id`，模型自动拿到完整上下文
 *   - 对比第 3 课：不用手动维护 input 数组，代码量大幅减少
 *   - 注意：所有历史 input tokens 仍然会被计费（不是免费的）
 *
 * 运行：pnpm l15
 */

import "dotenv/config";
import OpenAI from "openai";
import type { Response } from "openai/resources/responses/responses";
import * as readline from "node:readline/promises";

const client = new OpenAI();
const MODEL = "gpt-5.4-nano";

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("=== Lesson 15 · previous_response_id 多轮对话 ===");
  console.log("输入消息开始聊天，输入 /exit 退出，输入 /tokens 查看用量\n");

  // 核心：只需要一个变量来追踪上一次响应的 ID
  let previousResponseId: string | null = null;

  // 读到 EOF（Ctrl-D 或 stdin pipe 结束）时设 closed，让主循环自然退出
  let closed = false;
  rl.once("close", () => {
    closed = true;
  });

  while (!closed) {
    let userInput: string;
    try {
      userInput = await rl.question("You: ");
    } catch {
      break; // readline 已关闭
    }

    if (userInput.trim() === "/exit") {
      console.log("Bye!");
      rl.close();
      break;
    }

    if (userInput.trim() === "/tokens") {
      if (!previousResponseId) {
        console.log("  还没有发过消息，无法查看用量\n");
        continue;
      }
      // 通过 retrieve 获取上一次响应的 usage
      const prev = await client.responses.retrieve(previousResponseId);
      console.log("  上一轮 usage:", JSON.stringify(prev.usage, null, 2), "\n");
      continue;
    }

    if (!userInput.trim()) continue;

    // ── 核心调用：只需 previous_response_id + 新消息 ──
    const response: Response = await client.responses.create({
      model: MODEL,
      input: [{ role: "user", content: userInput }],
      store: true, // 必须为 true，否则服务端不会保存响应
      previous_response_id: previousResponseId, // null 表示第一轮，OpenAI 接受 null
    });

    console.log(`AI: ${response.output_text}`);
    console.log(
      `  [tokens: input=${response.usage?.input_tokens}, output=${response.usage?.output_tokens}]\n`
    );

    // 更新 ID，下一轮请求会用到
    previousResponseId = response.id;
  }
}

main().catch((err) => {
  console.error("Something went wrong:", err);
  process.exit(1);
});
