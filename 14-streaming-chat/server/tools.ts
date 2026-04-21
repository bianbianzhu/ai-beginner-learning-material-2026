/**
 * 工具集（教学用，mock 数据）
 * 结构和 Lesson 12 的 agent.ts 完全一致。
 * 流式 tool call 的事件在 server.ts 里处理。
 */

import type { FunctionTool } from "openai/resources/responses/responses.mjs";

export const tools: FunctionTool[] = [
  {
    type: "function",
    name: "get_weather",
    description: "Get the current weather for a city (mock data for demo).",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        city: {
          type: "string",
          description: "City name in English, e.g. 'Tokyo', 'London'.",
        },
      },
      required: ["city"],
    },
  },
  {
    type: "function",
    name: "get_current_time",
    description: "Get the current server time in ISO format.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        timezone: {
          type: "string",
          description: "IANA timezone, e.g. 'Asia/Tokyo'. Defaults to UTC.",
        },
      },
      required: ["timezone"],
    },
  },
];

// 教学用 mock 实现。实际项目替换成真实 API 调用。
const WEATHER_MOCK: Record<string, { tempC: number; sky: string }> = {
  tokyo: { tempC: 18, sky: "clear" },
  london: { tempC: 9, sky: "rainy" },
  "new york": { tempC: 12, sky: "cloudy" },
  beijing: { tempC: 5, sky: "smoggy" },
  shanghai: { tempC: 14, sky: "drizzle" },
  sydney: { tempC: 22, sky: "sunny" },
};

export async function runTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  // 模拟一点延迟，让流式动画更明显
  await new Promise((r) => setTimeout(r, 300));

  switch (name) {
    case "get_weather": {
      const city = String(args.city ?? "").toLowerCase().trim();
      const hit = WEATHER_MOCK[city];
      if (!hit) {
        return { city, error: "no data for this city (mock)" };
      }
      return { city, ...hit, unit: "celsius" };
    }

    case "get_current_time": {
      const tz = typeof args.timezone === "string" && args.timezone ? args.timezone : "UTC";
      try {
        const now = new Date().toLocaleString("en-US", { timeZone: tz });
        return { timezone: tz, now };
      } catch {
        return { timezone: tz, error: "invalid timezone" };
      }
    }

    default:
      return { error: `unknown tool: ${name}` };
  }
}
