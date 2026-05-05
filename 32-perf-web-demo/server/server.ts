import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import OpenAI from "openai";

// Lesson 32 · server.ts
// 两条路由演示「让用户少等」的极致体验差距：
//   POST /api/chat/slow   非-streaming，await 整段回复后一次性 JSON 返回
//   POST /api/chat/fast   streaming，SSE 把 delta 一片一片推给前端
// Stateless：单轮对话，不保存 session。

const client = new OpenAI();
const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

// ============ Slow: non-streaming ============
app.post("/api/chat/slow", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { question } = req.body as { question?: string };
    if (typeof question !== "string" || question.trim().length < 1) {
      res.status(400).json({ ok: false, error: "missing question" });
      return;
    }

    const start = performance.now();
    const resp = await client.responses.create({
      model: "gpt-5.4-nano",
      input: question,
    });
    const total = performance.now() - start;

    res.json({
      ok: true,
      answer: resp.output_text,
      total_ms: Math.round(total),
      output_tokens: resp.usage?.output_tokens ?? 0,
    });
  } catch (err) {
    next(err);
  }
});

// ============ Fast: streaming via SSE ============
app.post("/api/chat/fast", async (req: Request, res: Response) => {
  const { question } = req.body as { question?: string };
  if (typeof question !== "string" || question.trim().length < 1) {
    res.status(400).json({ ok: false, error: "missing question" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const start = performance.now();
  let ttft: number | null = null;
  let outputTokens = 0;

  try {
    const stream = await client.responses.create({
      model: "gpt-5.4-nano",
      input: question,
      stream: true,
    });

    for await (const ev of stream) {
      if (ev.type === "response.output_text.delta") {
        if (ttft === null) ttft = performance.now() - start;
        send("delta", { text: ev.delta });
      } else if (ev.type === "response.completed") {
        outputTokens = ev.response.usage?.output_tokens ?? 0;
      }
    }

    const total = performance.now() - start;
    send("done", {
      ttft_ms: ttft === null ? null : Math.round(ttft),
      total_ms: Math.round(total),
      output_tokens: outputTokens,
    });
    res.end();
  } catch (err) {
    send("error", { message: (err as Error).message });
    res.end();
  }
});

// Express v5 global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[server error]", err);
  res.status(500).json({ ok: false, error: err.message });
});

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  console.log(`Lesson 32 server listening on http://localhost:${PORT}`);
  console.log(`  POST /api/chat/slow   (non-streaming)`);
  console.log(`  POST /api/chat/fast   (SSE streaming)`);
});
