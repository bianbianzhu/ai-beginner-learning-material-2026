/**
 * Lesson 25 · 建一个 OpenAI 托管的 Vector Store
 * -----------------------------------------------------------
 * 目标：把第 24 课的 "内存数组" 换成 OpenAI 托管的向量库。
 *        这节课只建库（一次性），下一个文件 query-store.ts 负责查。
 *
 * 2026 关键点：
 *   - 所有事 OpenAI 帮你做：上传 → 自动切块（800/400）→ 自动 embed → 建索引
 *   - 建库是异步的：文件 status 会从 in_progress 变到 completed
 *   - expires_after 是省钱利器：教学场景设 7 天，过期自动清理
 *   - 前 1 GB 存储免费；之后 $0.10/GB/日
 *
 * 运行：pnpm l25:create
 *
 * 输出：一个 vs_xxx 的 id。把它加到 .env：
 *   VECTOR_STORE_ID=vs_xxx
 * 后续第 25~27 课的 query/file_search/express 都会读这个环境变量。
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const client = new OpenAI();

// KB 目录复用第 24 课的（一份数据，两种方案）
const KB_DIR = path.join(__dirname, "..", "24-rag-memory", "kb");
const files = fs.readdirSync(KB_DIR).filter((f) => f.endsWith(".md"));

console.log(`📁 准备上传 ${files.length} 个文件到 OpenAI Files API ...`);

// 1. 上传文件（并行）
const fileIds = await Promise.all(
  files.map(async (f) => {
    const uploaded = await client.files.create({
      file: fs.createReadStream(path.join(KB_DIR, f)),
      purpose: "assistants", // vector store 要求 purpose = "assistants"
    });
    console.log(`   ✓ ${f.padEnd(28)} → ${uploaded.id}`);
    return uploaded.id;
  })
);

// 2. 建 vector store（file_ids 直接带进去，OpenAI 内部会去切/embed/索引）
console.log("\n🗂  创建 vector store ...");
const vs = await client.vectorStores.create({
  name: "ai-in-2026-purrcloud",
  file_ids: fileIds,
  // 过期策略：7 天无访问自动过期 → 省存储费
  expires_after: { anchor: "last_active_at", days: 7 },
});
console.log(`   ✓ created: ${vs.id}`);

// 3. 轮询等 chunking + embedding 完成
console.log("\n⏳ 等待 OpenAI 完成切块 & 索引 ...");
let current = vs;
while (current.status === "in_progress") {
  await new Promise((r) => setTimeout(r, 1500));
  current = await client.vectorStores.retrieve(vs.id);
  const { completed, in_progress, failed, total } = current.file_counts;
  process.stdout.write(
    `\r   ${completed}/${total} done · ${in_progress} in-progress · ${failed} failed `
  );
}
process.stdout.write("\n");

console.log(`\n✅ 状态: ${current.status}`);
console.log(`📊 file_counts:`, current.file_counts);
console.log(`💾 usage_bytes: ${current.usage_bytes}`);

console.log("\n🎉 完成！请把下面这行加到 .env：\n");
console.log(`   VECTOR_STORE_ID=${vs.id}\n`);
console.log("然后继续：");
console.log("   pnpm l25:query              # 只检索，不调 LLM");
console.log("   pnpm l26                    # 让 LLM 用 file_search tool 自己查");
console.log("   pnpm l27                    # 跑 Express RAG API");
