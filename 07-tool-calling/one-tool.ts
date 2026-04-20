/**
 * Lesson 7 · Tool Calling（单轮工具调用）
 * -----------------------------------------------------------
 * 目标：让 AI 发现"我不知道/我做不了"，**主动调用你定义的函数**。
 *
 * 流程：
 *   (1) 第一次请求  → 告诉 AI 你有哪些工具
 *   (2) AI 决定调工具 → 返回 `{ type: "function_call", call_id, name, arguments }`
 *   (3) 你本地执行工具 → 拿到结果
 *   (4) 把结果作为 `function_call_output` 回传 → AI 组装最终答案
 *
 * 2026 关键点：
 *   - tool 定义：`{ type: "function", name, description, parameters, strict: true }`
 *   - 最佳实践：**严格模式** strict=true + additionalProperties=false + 所有字段 required
 *   - 本课只展示**一轮**调用；Lesson 12 会把它扩展成完整 loop
 *
 * 运行：pnpm l7
 */

import "dotenv/config";
import OpenAI from "openai";

const client = new OpenAI();

// ---------- 1. 定义一个本地"假"工具 ----------
function getWeather(city: string): { city: string; tempC: number; sky: string } {
  // 真实场景下这里会调天气 API；教学就写死
  const db: Record<string, { tempC: number; sky: string }> = {
    tokyo: { tempC: 18, sky: "clear" },
    beijing: { tempC: 12, sky: "smoggy" },
    london: { tempC: 9, sky: "rainy" },
  };
  const key = city.toLowerCase();
  return { city, ...(db[key] ?? { tempC: 20, sky: "unknown" }) };
}

// ---------- 2. 把工具描述给 AI ----------
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
  // ---------- 3. 第一次请求：提问 + 传工具 ----------
  console.log(">>> Turn 1: ask AI 'weather in Tokyo?'\n");

  const turn1 = await client.responses.create({
    model: "gpt-5.4-nano",
    input: "What's the weather in Tokyo right now?",
    tools,
  });

  console.log("turn1.output:");
  console.log(JSON.stringify(turn1.output, null, 2));

  // ---------- 4. 扫描 output[]，找 function_call ----------
  const toolCalls = turn1.output.filter((item) => item.type === "function_call");

  if (toolCalls.length === 0) {
    console.log("\nAI did not call any tool. Final answer:");
    console.log(turn1.output_text);
    return;
  }

  // ---------- 5. 在本地执行每一个工具调用 ----------
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

    // function_call_output 必须回传和 call_id 对应
    toolOutputs.push({
      type: "function_call_output",
      call_id: call.call_id,
      output: JSON.stringify(result), // output 必须是字符串
    });
  }

  // ---------- 6. 第二次请求：把历史（含 function_call + function_call_output）再发一遍 ----------
  console.log("\n>>> Turn 2: send tool results back to AI\n");

  // input 需要包含：① 之前 AI 返回的所有 output 原样回传 ② 我们本地执行得到的 tool outputs
  const nextInput = [...turn1.output, ...toolOutputs];

  const turn2 = await client.responses.create({
    model: "gpt-5.4-nano",
    input: nextInput as OpenAI.Responses.ResponseInput,
    tools,
  });

  console.log("Final answer from AI:");
  console.log(turn2.output_text);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
