import "dotenv/config";
import OpenAI from "openai";

// Lesson 29 · baseline.ts
// 非-streaming 调用：客户端要等到完整回复生成完才能看到一个字。
// 我们测量的是「总耗时」(Total) —— 也是用户实际等待的时间。

const client = new OpenAI(); // OPENAI_API_KEY 自动从环境变量读取

const PROMPT =
  "请用大约 300 字介绍一下黑洞是怎么形成的，要让一个高中生能听懂。";

async function main() {
  console.log("========== 非-streaming (baseline) ==========");
  const start = performance.now();

  const resp = await client.responses.create({
    model: "gpt-5.4-nano",
    input: PROMPT,
  });

  const total = performance.now() - start;

  console.log(`TTFT:   N/A (整段一起返回)`);
  console.log(`Total:  ${total.toFixed(0)} ms`);
  console.log(`Tokens: ${resp.usage?.output_tokens ?? "?"}`);
  console.log("");
  console.log("回复内容预览:");
  console.log(resp.output_text.slice(0, 80) + "...");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
