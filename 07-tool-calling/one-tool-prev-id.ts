/**
 * Lesson 7 · Tool Calling（写法 B：previous_response_id）
 * -----------------------------------------------------------
 * 与 `one-tool.ts` 同一个例子，但 Turn 2 改用 **previous_response_id**：
 *
 *   one-tool.ts          ：手动拼 [user, ...turn1.output, ...toolOutputs]
 *   one-tool-prev-id.ts  ：服务端帮你接历史，只需传 toolOutputs
 *
 * 为什么推荐这种写法（reasoning 模型尤其推荐）：
 *   1. 代码更短：不用自己维护 history 数组
 *   2. reasoning items 自动保留：手动拼 input 时如果漏了 reasoning item，
 *      会损失工具调用准确率（OpenAI cookbook 在 SWE-bench 上测过 ~3%）
 *   3. 默认 store=true：响应被服务端保留 30 天，previous_response_id 才有效
 *
 * 何时不能用：
 *   - Zero Data Retention (ZDR) 流量：必须 store=false → 用写法 A 手动拼
 *   - 想完全无状态、自己持久化历史 → 用写法 A
 *
 * 运行：pnpm l7:prev-id
 */

import "dotenv/config";
import OpenAI from "openai";

const client = new OpenAI();

// ---------- 1. 本地"假"工具 ----------
function getWeather(city: string): { city: string; tempC: number; sky: string } {
  const db: Record<string, { tempC: number; sky: string }> = {
    tokyo: { tempC: 18, sky: "clear" },
    beijing: { tempC: 12, sky: "smoggy" },
    london: { tempC: 9, sky: "rainy" },
  };
  const key = city.toLowerCase();
  return { city, ...(db[key] ?? { tempC: 20, sky: "unknown" }) };
}

// ---------- 2. 工具描述 ----------
const tools = [
  {
    type: "function" as const,
    name: "get_weather",
    description: "Get the current weather for a given city",
    parameters: {
      type: "object",
      properties: {
        city: {
          type: "string",
          description: "City name, e.g. 'Tokyo', 'Beijing'",
        },
      },
      required: ["city"],
      additionalProperties: false,
    },
    strict: true,
  },
];

async function main() {
  // ---------- 3. Turn 1：提问 + 传工具 ----------
  console.log(">>> Turn 1: ask AI 'weather in Tokyo?'\n");

  const turn1 = await client.responses.create({
    model: "gpt-5.4-nano",
    input: "What's the weather in Tokyo right now?",
    tools,
    // store: true 是默认值；显式写出来强调 previous_response_id 依赖它
    store: true,
  });

  console.log("turn1.id:", turn1.id);
  console.log("turn1.output:");
  console.log(JSON.stringify(turn1.output, null, 2));

  // ---------- 4. 找 function_call ----------
  const toolCalls = turn1.output.filter((item) => item.type === "function_call");

  if (toolCalls.length === 0) {
    console.log("\nAI did not call any tool. Final answer:");
    console.log(turn1.output_text);
    return;
  }

  // ---------- 5. 本地执行 ----------
  const toolOutputs: { type: "function_call_output"; call_id: string; output: string }[] = [];

  for (const call of toolCalls) {
    console.log(`\n>>> AI wants to call: ${call.name}(${call.arguments})`);

    const args = JSON.parse(call.arguments);
    let result: unknown;

    if (call.name === "get_weather") {
      result = getWeather(args.city);
    } else {
      result = { error: `Unknown tool: ${call.name}` };
    }

    console.log("    local result:", result);

    toolOutputs.push({
      type: "function_call_output",
      call_id: call.call_id,
      output: JSON.stringify(result),
    });
  }

  // ---------- 6. Turn 2：只传 toolOutputs，历史靠 previous_response_id ----------
  console.log("\n>>> Turn 2: send tool results back via previous_response_id\n");

  // 对比写法 A：input 里**只有** toolOutputs，没有 user prompt、没有 turn1.output
  // 服务端会按 previous_response_id 自动拼上完整历史（含 reasoning items）
  const turn2 = await client.responses.create({
    model: "gpt-5.4-nano",
    previous_response_id: turn1.id,
    input: toolOutputs as OpenAI.Responses.ResponseInput,
    tools,
  });

  console.log("Final answer from AI:");
  console.log(turn2.output_text);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
