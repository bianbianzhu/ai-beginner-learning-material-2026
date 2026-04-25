/**
 * Lesson 12 · CLI Agent（完整 ReAct Loop + 工具调用循环）
 * -----------------------------------------------------------
 * 目标：在终端里跑一个真·Agent —— 它可以调工具、看结果、再思考、再调工具，直到能答复。
 *
 * 本课 = Lesson 11（CLI 对话）+ Lesson 7（工具调用）+ Lesson 8（ReAct loop）
 *
 * 提供的玩具工具：
 *   - get_time()            返回当前时间
 *   - add(a, b)             加法（让 AI 不用自己算）
 *   - search_notes(query)   在一段"个人笔记"里做关键词搜索
 *
 * 运行：pnpm l12
 * 试试问：
 *   - What time is it?
 *   - Add 128 and 317.
 *   - What did I write about Docker in my notes?
 *   - Search my notes for "roller" and also tell me the time.
 */

import "dotenv/config";
import OpenAI from "openai";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const client = new OpenAI();

// =========================== 本地工具实现 ============================
const NOTES = [
  "2025-11-02: Setting up Docker Compose for the roller-digital backend.",
  "2025-12-14: Migrated from Chat Completions to Responses API. Much cleaner.",
  "2026-01-20: Tried gpt-5.4-nano for summaries — 10x cheaper, same quality.",
  "2026-02-03: Added Conversations API to avoid managing history in Redis.",
  "2026-03-11: Roller-digital Q1 offsite in Singapore.",
];

function runTool(name: string, args: Record<string, unknown>): unknown {
  switch (name) {
    case "get_time":
      return { now: new Date().toISOString() };
    case "add": {
      const a = Number(args.a);
      const b = Number(args.b);
      return { sum: a + b };
    }
    case "search_notes": {
      const q = String(args.query ?? "").toLowerCase();
      const hits = NOTES.filter((n) => n.toLowerCase().includes(q));
      return { query: q, hits, count: hits.length };
    }
    default:
      return { error: `unknown tool: ${name}` };
  }
}

// =========================== 给 AI 的工具定义 ============================
const tools: OpenAI.Responses.FunctionTool[] = [
  {
    type: "function",
    name: "get_time",
    description: "Get the current UTC time in ISO 8601 format.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "add",
    description: "Add two numbers. Use this instead of mental math.",
    parameters: {
      type: "object",
      properties: { a: { type: "number" }, b: { type: "number" } },
      required: ["a", "b"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "search_notes",
    description:
      "Case-insensitive keyword search over the user's personal notes.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "a single keyword or short phrase",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    strict: true,
  },
];

const INSTRUCTIONS = `
You are a helpful agent with access to tools.
- When the user asks for data you cannot know (time, notes content) or math, call the appropriate tool.
- You may call multiple tools in one turn if useful (parallel).
- After all tool results are in, give a concise final answer.
`.trim();

// =========================== ReAct Loop ============================
async function runAgent(history: OpenAI.Responses.ResponseInput) {
  const MAX_STEPS = 8; // 防止死循环
  for (let step = 1; step <= MAX_STEPS; step++) {
    const resp = await client.responses.create({
      model: "gpt-5.4-nano",
      instructions: INSTRUCTIONS,
      input: history,
      tools,
    });

    // 把本轮 AI 产生的所有 output（可能是文本，可能是工具调用）原样加入历史
    // 类型断言：resp.output 是 ResponseOutputItem[]，它是 ResponseInputItem 的一个超集；
    // 教学中我们只会产生 message / function_call，都是安全子集。
    history.push(...(resp.output as OpenAI.Responses.ResponseInputItem[]));

    const toolCalls = resp.output.filter(
      (item): item is OpenAI.Responses.ResponseFunctionToolCall =>
        item.type === "function_call",
    );

    // 没有工具调用 → 循环结束，返回最终文本
    if (toolCalls.length === 0) {
      return { text: resp.output_text, steps: step };
    }

    // 有工具调用 → 本地执行，把结果塞回历史
    console.log(`  [step ${step}] ${toolCalls.length} tool call(s):`);
    for (const call of toolCalls) {
      const args = JSON.parse(call.arguments);
      console.log(`    → ${call.name}(${JSON.stringify(args)})`);

      const result = runTool(call.name, args);
      console.log(`      ← ${JSON.stringify(result)}`);

      history.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result),
      });
    }
  }

  throw new Error(
    `Agent exceeded ${MAX_STEPS} reasoning steps without answering.`,
  );
}

// =========================== CLI Shell ============================
async function main() {
  const rl = readline.createInterface({ input, output });
  let closed = false;
  rl.on("close", () => {
    closed = true;
  });

  const history: OpenAI.Responses.ResponseInput = [];

  console.log(
    "🤖 CLI Agent ready. Tools available: get_time, add, search_notes.",
  );
  console.log("   Type '/exit' to quit, '/reset' to clear history.\n");

  while (!closed) {
    let userText: string;
    try {
      userText = (await rl.question("you > ")).trim();
    } catch {
      break;
    }
    if (!userText) continue;
    if (userText === "/exit") {
      console.log("bye 👋");
      break;
    }
    if (userText === "/reset") {
      history.length = 0;
      console.log("🧹 history cleared.\n");
      continue;
    }

    history.push({ role: "user", content: userText });

    try {
      const { text, steps } = await runAgent(history);
      console.log(
        `ai  > ${text}   (took ${steps} step${steps > 1 ? "s" : ""})\n`,
      );
    } catch (err) {
      console.error("[agent error]", err);
    }
  }

  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
