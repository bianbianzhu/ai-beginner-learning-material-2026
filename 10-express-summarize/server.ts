/**
 * Lesson 10 · Express v5 单轮 Summarization API
 * -----------------------------------------------------------
 * 目标：把 AI 能力包装成一个 HTTP 接口，前端/客户端可以直接调用。
 *
 * 架构分层：
 *   - controller：接收 HTTP 请求，做校验，调 service，返回 JSON
 *   - service   ：只负责和 OpenAI 打交道（可复用、可测试、可替换模型）
 *   这一课为了精简放在一个文件里，但用注释分成两部分。
 *
 * 2026 关键点：
 *   - Express v5 原生支持 async handler（抛 error 自动进 error middleware）
 *   - 统一 response 格式：{ ok, data, error }
 *
 * 运行：pnpm l10
 * 测试：
 *   curl -X POST http://localhost:3000/api/summarize \
 *        -H "Content-Type: application/json" \
 *        -d '{"text":"Put a long paragraph here..."}'
 */

import "dotenv/config";
import express from "express";
import OpenAI from "openai";

// ==================== Service（AI 调用封装）====================
const client = new OpenAI();

async function summarize(
  text: string,
): Promise<{ summary: string; usage: OpenAI.Responses.Response["usage"] }> {
  const response = await client.responses.create({
    model: "gpt-5.4-nano",
    instructions:
      "You are a concise summarizer. Output EXACTLY 3 bullet points (one line each), no preamble.",
    input: text,
    temperature: 0.3, // 低温度 = 产品级稳定 （鉴于5.4 by default 没有开启reasoning）
  });
  return { summary: response.output_text, usage: response.usage };
}

// ==================== Controller（HTTP 层）====================
const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/summarize", async (req, res) => {
  const { text } = req.body ?? {};

  // 输入校验
  if (typeof text !== "string") {
    return res.status(400).json({
      ok: false,
      error: "field `text` is required and must be a string",
    });
  }
  if (text.length < 20) {
    return res
      .status(400)
      .json({ ok: false, error: "text must be at least 20 characters" });
  }
  if (text.length > 20_000) {
    return res
      .status(400)
      .json({ ok: false, error: "text must be at most 20000 characters" });
  }

  const { summary, usage } = await summarize(text);

  res.json({ ok: true, data: { summary, usage } });
});

// 统一错误处理 —— Express v5 会自动把 async 抛的异常传进来
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("[server error]", err);
    res
      .status(500)
      .json({ ok: false, error: err.message || "internal server error" });
  },
);

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  console.log(`🟢 Lesson 10 server up on http://localhost:${PORT}`);
  console.log(`   try: curl -X POST http://localhost:${PORT}/api/summarize \\`);
  console.log(`          -H "Content-Type: application/json" \\`);
  console.log(`          -d '{"text":"..."}'`);
});
