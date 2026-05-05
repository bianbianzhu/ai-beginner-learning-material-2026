import "dotenv/config";
import OpenAI from "openai";

// Lesson 29 · streaming.ts
// streaming 调用：客户端在 ~1s 内就能开始看到字（TTFT），
// 但「总耗时」(Total) 和 baseline.ts 几乎一样。
// 这就是「让用户感觉更快」的核心：感知延迟 ≪ 实际延迟。

const client = new OpenAI();

const PROMPT =
  "请用大约 300 字介绍一下黑洞是怎么形成的，要让一个高中生能听懂。";

async function main() {
  console.log("========== streaming ==========");
  const start = performance.now();
  let ttft: number | null = null;
  let outputTokens = 0;

  const stream = await client.responses.create({
    model: "gpt-5.4-nano",
    input: PROMPT,
    stream: true,
  });

  for await (const ev of stream) {
    if (ev.type === "response.output_text.delta" && ttft === null) {
      ttft = performance.now() - start;
    }
    if (ev.type === "response.completed") {
      outputTokens = ev.response.usage?.output_tokens ?? 0;
    }
  }

  const total = performance.now() - start;

  if (ttft === null) {
    console.error("❌ 没有收到 output_text.delta —— 可能模型啥也没回");
    process.exit(1);
  }

  console.log(`TTFT:   ${ttft.toFixed(0)} ms   ← 用户 ${(ttft / 1000).toFixed(1)}s 就开始看到字`);
  console.log(`Total:  ${total.toFixed(0)} ms   ← 总时长几乎和 baseline 一样`);
  console.log(`Tokens: ${outputTokens}`);
  console.log("");
  console.log("📌 对比 baseline：用户的「等待感」从 Total 缩到了 TTFT，是数量级的差别。");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
