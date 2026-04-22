/**
 * Lesson 27 · RAG Express API —— 把 file_search 包成 HTTP 服务
 * -----------------------------------------------------------
 * 目标：综合第 13 课 + 第 26 课 —— 一个真实世界可用的 RAG 后端。
 *
 * 路由：
 *   POST /api/rag         body: { question }
 *     → { success, data: { answer, citations: [{filename, index}], usage } }
 *   GET  /healthz
 *
 * 2026 关键点：
 *   - Express v5 已支持 async route handler 的错误冒泡
 *   - citations 单独取出 → 前端能做"点击引用跳转"
 *   - 统一错误格式 { success: false, error }
 *
 * 运行：pnpm l27
 *
 * 测试：
 *   curl -s -X POST http://localhost:3000/api/rag \
 *        -H "Content-Type: application/json" \
 *        -d '{"question":"PurrCloud 每月配送几次？"}' | jq
 */

import "dotenv/config";
import express from "express";
import OpenAI from "openai";

const client = new OpenAI();
const vsId = process.env.VECTOR_STORE_ID;
if (!vsId) {
  console.error("❌ 请先运行 pnpm l25:create，把 VECTOR_STORE_ID 加到 .env");
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, vector_store_id: vsId });
});

app.post("/api/rag", async (req, res) => {
  const question = req.body?.question;
  if (typeof question !== "string" || question.trim().length < 2) {
    return res.status(400).json({
      success: false,
      error: "question 必须是至少 2 个字符的字符串",
    });
  }

  try {
    const resp = await client.responses.create({
      model: "gpt-5.4-nano",
      instructions:
        "你是 PurrCloud 客服助手，用中文回答。仅根据 file_search 返回的资料作答。资料里没有的信息请回答'暂无相关信息'并引导用户拨打 400-MEW-CATS。",
      input: question,
      tools: [
        {
          type: "file_search",
          vector_store_ids: [vsId],
          max_num_results: 3,
        },
      ],
    });

    // 从 output 里拎出 citations
    const citations: { filename: string; file_id: string; index: number }[] = [];
    for (const item of resp.output) {
      if (item.type !== "message") continue;
      for (const part of item.content) {
        if (part.type !== "output_text") continue;
        for (const a of part.annotations) {
          if (a.type === "file_citation") {
            citations.push({
              filename: a.filename,
              file_id: a.file_id,
              index: a.index,
            });
          }
        }
      }
    }

    res.json({
      success: true,
      data: {
        answer: resp.output_text,
        citations,
        usage: resp.usage,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "unknown error",
    });
  }
});

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  console.log(`🚀 RAG API running at http://localhost:${PORT}`);
  console.log(`   POST http://localhost:${PORT}/api/rag   body: { "question": "..." }`);
  console.log(`   GET  http://localhost:${PORT}/healthz`);
  console.log(`   vector_store_id = ${vsId}`);
});
