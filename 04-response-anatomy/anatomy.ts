/**
 * Lesson 4 · Response 数据结构解剖
 * -----------------------------------------------------------
 * 目标：看懂 OpenAI 返回的 response 对象里到底有什么。
 *
 * 你会看到的字段：
 *   - id              响应的唯一 ID（可用于 previous_response_id 链式对话）
 *   - model           实际用的模型名
 *   - created_at      unix timestamp
 *   - status          "completed" / "failed" / ...
 *   - output[]        **输出项数组**（每一项是 message / function_call / reasoning 等）
 *   - output_text     SDK 便捷字段：把所有文本 output 拼成一个字符串
 *   - usage           token 消耗（input / output / total）→ 直接决定你花了多少钱
 *
 * 2026 关键点：
 *   - **不要假设 output[0].content[0].text 永远存在** —— output 可能是工具调用或 reasoning
 *   - 用 `output_text` 读文本；遍历 `output[]` 才是通用写法
 *
 * 运行：pnpm l4
 */

import "dotenv/config";
import OpenAI from "openai";

const client = new OpenAI();

async function main() {
  const response = await client.responses.create({
    model: "gpt-5.4-nano",
    input: "List 3 primary colors in a JSON array.",
  });

  console.log("========== 1. 完整原始返回 ==========");
  console.log(JSON.stringify(response, null, 2));

  console.log("\n========== 2. 关键字段 ==========");
  console.log("response.id          =", response.id);
  console.log("response.model       =", response.model);
  console.log("response.status      =", response.status);
  console.log("response.created_at  =", response.created_at);

  console.log("\n========== 3. output[] 遍历 ==========");
  console.log("output.length =", response.output.length);
  for (const [i, item] of response.output.entries()) {
    console.log(`  output[${i}].type =`, item.type);
    if (item.type === "message") {
      for (const [j, c] of item.content.entries()) {
        console.log(`    content[${j}].type =`, c.type);
        if (c.type === "output_text") {
          console.log(`    content[${j}].text =`, c.text);
        }
      }
    }
  }

  console.log("\n========== 4. 便捷字段 output_text ==========");
  console.log(response.output_text);

  console.log("\n========== 5. usage（token 消耗 = 钱） ==========");
  console.log(response.usage);
  // 估算成本（gpt-5.4-nano 定价：$0.10 / 1M input tokens, $0.625 / 1M output tokens）
  const inTok = response.usage?.input_tokens ?? 0;
  const outTok = response.usage?.output_tokens ?? 0;
  const costUsd = (inTok * 0.1 + outTok * 0.625) / 1_000_000;
  console.log(`estimated cost ≈ $${costUsd.toFixed(6)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
