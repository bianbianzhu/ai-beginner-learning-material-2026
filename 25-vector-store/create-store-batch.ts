/**
 * Lesson 25d · 用 fileBatches.createAndPoll 建 Vector Store
 * -----------------------------------------------------------
 * 目标：展示另一种更一致的建库 pattern：
 *        先创建空 vector store，再用 file batch 加文件并等待索引完成。
 *
 * 和 create-store.ts 的区别：
 *   - create-store.ts: vectorStores.create({ file_ids }) + 手写 while 轮询
 *   - 本文件:       vectorStores.create() + fileBatches.createAndPoll({ file_ids })
 *
 * 关键点：
 *   - vectorStores.create() 不传 file_ids，只创建空容器
 *   - fileBatches.createAndPoll() 会添加文件，并等待 chunking + embedding + indexing
 *   - 所以这里不需要自己写 while 循环轮询 vector store.status
 *
 * 运行：pnpm l25:create:batch
 *
 * 输出：一个 vs_xxx 的 id。把它加到 .env：
 *   VECTOR_STORE_ID=vs_xxx
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const client = new OpenAI();

const KB_DIR = path.join(__dirname, "..", "24-rag-memory", "kb");
const files = fs.readdirSync(KB_DIR).filter((f) => f.endsWith(".md"));

console.log(`📁 准备上传 ${files.length} 个文件到 OpenAI Files API ...`);

const fileIds = await Promise.all(
  files.map(async (f) => {
    const uploaded = await client.files.create({
      file: fs.createReadStream(path.join(KB_DIR, f)),
      purpose: "assistants",
    });
    console.log(`   ✓ ${f.padEnd(28)} -> ${uploaded.id}`);
    return uploaded.id;
  }),
);

console.log("\n🗂  创建空 vector store ...");
const vs = await client.vectorStores.create({
  name: "ai-in-2026-purrcloud-batch",
  expires_after: { anchor: "last_active_at", days: 1 },
});
console.log(`   ✓ created: ${vs.id}  status=${vs.status}`);

console.log("\n⏳ 用 file batch 加文件，并等待 OpenAI 完成切块 & 索引 ...");
// createAndPoll = create file batch + poll batch status。
// 它会等 OpenAI 完成这些文件的 chunking、embedding、indexing。
// 这就是本文件不需要像 create-store.ts 那样手写 while 轮询的原因。
const batch = await client.vectorStores.fileBatches.createAndPoll(vs.id, {
  file_ids: fileIds,
});

console.log(`   ✓ batch: ${batch.id}  status=${batch.status}`);
console.log("   file_counts:", batch.file_counts);

if (batch.status !== "completed" || batch.file_counts.failed > 0) {
  console.error(
    `❌ file batch 未完成：status=${batch.status}, failed=${batch.file_counts.failed}`,
  );
  process.exit(1);
}

const current = await client.vectorStores.retrieve(vs.id);

console.log(`\n✅ vector store 状态: ${current.status}`);
console.log("📊 file_counts:", current.file_counts);
console.log(`💾 usage_bytes: ${current.usage_bytes}`);

console.log("\n🎉 完成！请把下面这行加到 .env：\n");
console.log(`   VECTOR_STORE_ID=${vs.id}\n`);
console.log("然后继续：");
console.log("   pnpm l25:query              # 只检索，不调 LLM");
console.log(
  "   pnpm l26                    # 让 LLM 用 file_search tool 自己查",
);
console.log("   pnpm l27                    # 跑 Express RAG API");
