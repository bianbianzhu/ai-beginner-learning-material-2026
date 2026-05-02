/**
 * Lesson 25c · Vector Store file attributes showcase
 * -----------------------------------------------------------
 * 目标：演示如何给 vector_store_file 添加 attributes，并用 filters 检索。
 *
 * 关键点：
 *   - attributes 挂在 vector_store_file 上，不是 OpenAI 自动切出来的单个 chunk 上
 *   - 同一个文件切出的多个 chunk，会返回同一份文件级 attributes
 *   - 想要“每个 chunk 不同 attributes”，需要自己先切 chunk，再把每个 chunk 当小文件上传
 *
 * 运行：
 *   pnpm tsx 25-vector-store/attributes-showcase.ts
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

type FileAttributes = Record<string, string | number | boolean>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const client = new OpenAI();

const KB_DIR = path.join(__dirname, "..", "24-rag-memory", "kb");

const ATTRIBUTES_BY_FILE: Record<string, FileAttributes> = {
  "purrcloud-about.md": {
    category: "about",
    lang: "zh",
    product: "purrcloud",
    version: 1,
    priority: 0.8,
  },
  "purrcloud-faq.md": {
    category: "faq",
    lang: "zh",
    product: "purrcloud",
    version: 1,
    priority: 1.2,
  },
  "purrcloud-plans.md": {
    category: "plans",
    lang: "zh",
    product: "purrcloud",
    version: 1,
    priority: 0.6,
  },
  "purrcloud-refund.md": {
    category: "refund",
    lang: "zh",
    product: "purrcloud",
    version: 1,
    priority: 0.4,
  },
  "purrcloud-shipping.md": {
    category: "shipping",
    lang: "zh",
    product: "purrcloud",
    version: 1,
    priority: 0.2,
  },
};

const files = fs.readdirSync(KB_DIR).filter((f) => f.endsWith(".md"));

console.log(`📁 上传 ${files.length} 个 KB 文件 ...`);
const uploadedFiles = await Promise.all(
  files.map(async (filename) => {
    const uploaded = await client.files.create({
      file: fs.createReadStream(path.join(KB_DIR, filename)),
      purpose: "assistants",
    });

    console.log(`   ✓ ${filename.padEnd(24)} -> ${uploaded.id}`);
    return { id: uploaded.id, filename };
  }),
);

console.log("\n🗂  创建一个专门用于 attributes showcase 的 vector store ...");
const vs = await client.vectorStores.create({
  name: "ai-in-2026-purrcloud-attributes-showcase",
  expires_after: { anchor: "last_active_at", days: 1 },
});
// 这里先创建空 vector store：没有 file_ids，所以不会触发文件 ingestion。
// await 返回后就可以拿 vs.id 去创建 file batch。
if (vs.status !== "completed") {
  console.error(`❌ vector store 还不可用：status=${vs.status}`);
  process.exit(1);
}
console.log(`   ✓ created: ${vs.id}  status=${vs.status}`);

console.log(
  "\n🏷  用 file batch 加文件和 attributes，并等待文件 ingestion 完成 ...",
);
// createAndPoll = create file batch + poll batch status。
// 它会等 OpenAI 完成这些文件的 chunking、embedding、indexing。
// 这就是本示例不需要像 create-store.ts 那样手写 while 轮询的原因。
const batch = await client.vectorStores.fileBatches.createAndPoll(vs.id, {
  files: uploadedFiles.map(({ id, filename }) => ({
    file_id: id,
    attributes: ATTRIBUTES_BY_FILE[filename] ?? {
      category: "unknown",
      lang: "zh",
      product: "purrcloud",
      version: 1,
    },
  })),
});

console.log(`   ✓ batch: ${batch.id}`);
console.log("   file_counts:", batch.file_counts);

if (batch.status !== "completed" || batch.file_counts.failed > 0) {
  console.error(
    `❌ file batch 未完成：status=${batch.status}, failed=${batch.file_counts.failed}`,
  );
  process.exit(1);
}

async function searchAndPrint(
  title: string,
  query: string,
  filters?: OpenAI.VectorStores.VectorStoreSearchParams["filters"],
) {
  console.log(`\n🔎 ${title}`);
  console.log(`   query: ${query}`);
  if (filters) console.log(`   filters: ${JSON.stringify(filters)}`);

  const results = await client.vectorStores.search(vs.id, {
    query,
    max_num_results: 3,
    rewrite_query: true,
    filters,
  });

  let i = 0;
  for await (const r of results) {
    i++;
    const text = r.content[0]?.text ?? "";
    console.log(`\n[${i}] score=${r.score.toFixed(3)}  file=${r.filename}`);
    console.log(`    attributes=${JSON.stringify(r.attributes)}`);
    console.log(`    ${text.slice(0, 140).replace(/\n/g, " ")}...`);
  }

  if (i === 0) console.log("   没有结果。");
}

await searchAndPrint("不加 filter：让检索自己找", "配送多久能到？");

await searchAndPrint(
  "加 category=shipping filter：只搜配送文件",
  "配送多久能到？",
  {
    type: "eq",
    key: "category",
    value: "shipping",
  },
);

await searchAndPrint(
  "加 category=refund filter：只搜退款文件",
  "退款政策是什么？",
  {
    type: "eq",
    key: "category",
    value: "refund",
  },
);

await searchAndPrint(
  "加 priority>=1 filter：只搜优先级大于等于 1 的文件",
  "配送政策是什么呢？",
  {
    type: "gte",
    key: "priority",
    value: 1,
  },
);

console.log("\n✅ showcase 完成");
console.log(`   临时 VECTOR_STORE_ID=${vs.id}`);
console.log("   这个库 1 天无访问后会自动过期。");
