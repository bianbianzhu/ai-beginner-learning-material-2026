/**
 * Lesson 11 · CLI 多轮对话（readline + 内存数组）
 * -----------------------------------------------------------
 * 目标：写一个能在终端里持续对话的 mini ChatGPT。
 *
 * 这一课把 Lesson 3（数组记忆）+ Lesson 4（usage）拼起来。
 *
 * 特殊命令：
 *   /exit    退出
 *   /reset   清空对话历史
 *   /tokens  显示累计 token 消耗和估算的美元成本
 *
 * 运行：pnpm l11
 */

import "dotenv/config";
import OpenAI from "openai";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const client = new OpenAI();

type HistoryItem = {
  role: "user" | "assistant" | "developer";
  content: string;
};

const INSTRUCTIONS = `
You are a friendly CLI coding buddy.
Keep answers concise (<= 5 lines unless the user asks for detail).
If asked to write code, always wrap it in a fenced code block with the language tag.
`.trim();

async function main() {
  const rl = readline.createInterface({ input, output });
  let closed = false;
  rl.on("close", () => {
    closed = true;
  });

  const history: HistoryItem[] = [{ role: "developer", content: INSTRUCTIONS }];

  let totalInTokens = 0;
  let totalOutTokens = 0;

  console.log(
    "🟢 CLI chat started. Type '/exit' to quit, '/reset' to clear, '/tokens' for usage.\n",
  );

  while (!closed) {
    let userText: string;
    try {
      userText = (await rl.question("you > ")).trim();
    } catch {
      // stdin closed (Ctrl-D or pipe EOF) → graceful exit
      break;
    }
    if (!userText) continue;

    if (userText === "/exit") {
      console.log("bye 👋");
      break;
    }
    if (userText === "/reset") {
      history.length = 0;
      history.push({ role: "developer", content: INSTRUCTIONS });
      console.log("🧹 history cleared.\n");
      continue;
    }
    if (userText === "/tokens") {
      // gpt-5.4-nano pricing: $0.10 / 1M input, $0.625 / 1M output
      const costUsd =
        (totalInTokens * 0.1 + totalOutTokens * 0.625) / 1_000_000;
      console.log(
        `📊 total tokens — in: ${totalInTokens}, out: ${totalOutTokens}  (≈ $${costUsd.toFixed(6)})\n`,
      );
      continue;
    }

    // ========== 发请求 ==========
    history.push({ role: "user", content: userText });

    const response = await client.responses.create({
      model: "gpt-5.4-nano",
      input: history,
    });

    const reply = response.output_text;
    history.push({ role: "assistant", content: reply });

    totalInTokens += response.usage?.input_tokens ?? 0;
    totalOutTokens += response.usage?.output_tokens ?? 0;

    console.log(`ai  > ${reply}\n`);
  }

  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
