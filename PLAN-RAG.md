# AI in 2026 · RAG 扩展篇（第 22~27 课）

> 目标：在已有的 21 节课（01–21）基础上，带学生从 0 到 1 搭一套 **可用的 RAG 系统**。
> 沿用课程约定：**TypeScript + OpenAI Responses API (2026) + `gpt-5.4-nano`**，
> 一节课一个可跑的文件，每一节都是上一节的"加一点点"。

> 为什么从 22 开始？因为第 21 课是已有的 **"上下文策略总览与对比"**（15–20 课收束课）。
> RAG 篇从 22 开始，刚好接上。

---

## 0. 为什么是 OpenAI 原生方案？

> 用户原问题："先用 openai developer mcp 查 Response API 有没有成熟 RAG；如果没有再去 LangChain 查。"

**查的结论：OpenAI 2026 已经把 RAG 做成了一等公民。**

三件套：

| 层 | 能力 | API / Tool |
|---|---|---|
| 1. Embedding | 把文字变向量 | `/v1/embeddings` · `text-embedding-3-small` / `-large` |
| 2. 托管向量库 | 存向量 + 自动分块 + 检索 | `/v1/vector_stores` · `client.vectorStores.*` |
| 3. 一句话接入 LLM | Responses API 里挂一个 tool 就能 RAG | `tools: [{ type: "file_search", vector_store_ids }]` |

**价格**：向量库**前 1 GB 存储免费**，超过 `$0.10/GB/日`；embedding 按 token 计费，非常便宜。
**实战含义**：学生已经有 `OPENAI_API_KEY` 就能完成全链路，不需要再注册 Pinecone / Supabase。

所以整条学习路径**坚持 OpenAI SDK only**，保持和课程前 21 节一致的风格。
（不引入 LangChain —— LangChain 做的事 OpenAI 原生都覆盖了，加一层封装反而让学生看不懂底层。）

---

## 1. 课程脉络（6 节课，每节课"加一点点"）

| # | 主题 | 新增能力 | 关键 API / 概念 |
|---|------|---------|----------------|
| 22 | RAG 概念可视化 | **看懂 RAG 两条流水线** | HTML 画 Ingest / Query pipeline（无代码，类似第 8/9 课） |
| 23 | Embeddings 基础 | **把文字变向量 + 算相似度** | `client.embeddings.create` · cosine = dot（向量已归一化） |
| 24 | Memory RAG | **手写一个"会查资料"的最小 demo** | 分段 → 批量 embed → 内存数组 → cosine top-K → Responses API |
| 25 | OpenAI Vector Store | **云上托管的向量库** | `client.files.create` · `client.vectorStores.create` · `client.vectorStores.search` |
| 26 | `file_search` hosted tool | **一行 tool，LLM 自动 RAG** | `tools: [{ type: "file_search", vector_store_ids }]` + `file_citation` annotations |
| 27 | Express + RAG API | **把 RAG 包成 HTTP 服务** | `POST /api/rag` → 复用第 13 课 session 思路，带引用返回 |

**两种方案覆盖**（用户明确要求的）：
- **Memory 版**：第 24 课。零外部依赖、进程内存、适合小规模 / 隐私敏感。
- **免费云版**：第 25–27 课。OpenAI 原生 vector store，前 1 GB 免费，零运维。

---

## 2. 共享知识库（跨 24/25/26/27 课）

做一个**虚构公司 "PurrCloud"** 的 FAQ，这样模型在没有 RAG 时答不上来、有 RAG 时能答对 + 带引用。放在 `24-rag-memory/kb/` 目录，后续课程复用。

```
24-rag-memory/kb/
├─ purrcloud-about.md      # 公司简介（创立于 2024、总部上海、宠物鲜粮）
├─ purrcloud-plans.md      # 订阅套餐（Nibble / Feast / Royal 三档价格）
├─ purrcloud-shipping.md   # 配送政策（每月 2 次 / 覆盖地区 / 冷链）
├─ purrcloud-refund.md     # 退款政策（7 天无理由 / 冷链破损全额退）
└─ purrcloud-faq.md        # 常见问题（过敏原、暂停订阅、客服时间）
```

**教学诀窍**：KB 全是虚构事实 → 学生能直观看到"如果不 RAG，LLM 会瞎编；接入 RAG 后，回答就对了"。

---

## 3. 每课详细设计

### 第 22 课 · `22-rag-concept/rag-flow.html`（HTML 可视化，无代码）
**目标**：让学生一眼看懂"RAG 在做什么"。

风格：完全沿用第 8/9 课的 dark theme（`#0f172a` 背景、CSS vars、纯手写、无框架、无 JS）。

内容：
- **上半区：Ingest Pipeline**（离线做）
  `Document` → `Chunker (800 tokens)` → `Embedder` → `Vector Store`
- **下半区：Query Pipeline**（在线做）
  `Question` → `Embedder` → `Retrieve Top-K` → `Context + Prompt` → `LLM` → `Answer + Citations`
- **底部 Takeaway**：RAG 的难点不是接 API，而是**分块 / 检索 / 评估**。

对应 README 讲"为什么需要向量数据库"（用 2026 的 OpenAI 术语写）。

### 第 23 课 · `23-embeddings/`
两个小文件，都是 <40 行。

**`embeddings.ts`** —— 把一段话变成一个向量：
```ts
const { data } = await client.embeddings.create({
  model: "text-embedding-3-small",
  input: "今天天气真好",
});
console.log("维度:", data[0].embedding.length);   // 1536
```

**`similarity.ts`** —— 用 cosine 比较 3 句话和 1 个 query 的相似度：
```ts
// OpenAI embeddings are already L2-normalized, so cosine = dot product
function cosine(a: number[], b: number[]) { let s=0; for (let i=0;i<a.length;i++) s+=a[i]*b[i]; return s; }
```

### 第 24 课 · `24-rag-memory/rag-memory.ts`
**目标**：**手写一个完整 RAG**，每个环节都暴露给学生。

流程：读 KB → 切段 → 批量 embed → 内存数组 → cosine top-3 → 拼 context → Responses API。

### 第 25 课 · `25-vector-store/`
**目标**：把第 24 课的 embed/store 换成 OpenAI 托管版本。

- `create-store.ts` —— `client.files.create` + `client.vectorStores.create({ file_ids, expires_after })` + 轮询到 `completed`
- `query-store.ts` —— `client.vectorStores.search(vsId, { query, max_num_results, rewrite_query: true })`

### 第 26 课 · `26-file-search/file-search.ts`
**目标**：Responses API 挂一个 `file_search` tool，让模型**自己去**检索 + 生成带 `file_citation` 的答案。

### 第 27 课 · `27-rag-express/server.ts`
**目标**：综合 13 + 26，写一个真 HTTP API，返回 `{ answer, citations, usage }`。

---

## 4. 文件与脚本一览

```
22-rag-concept/
├─ rag-flow.html
└─ README.md

23-embeddings/
├─ embeddings.ts
├─ similarity.ts
└─ README.md

24-rag-memory/
├─ kb/
│  ├─ purrcloud-about.md
│  ├─ purrcloud-plans.md
│  ├─ purrcloud-shipping.md
│  ├─ purrcloud-refund.md
│  └─ purrcloud-faq.md
├─ rag-memory.ts
└─ README.md

25-vector-store/
├─ create-store.ts
├─ query-store.ts
└─ README.md

26-file-search/
├─ file-search.ts
└─ README.md

27-rag-express/
├─ server.ts
└─ README.md
```

`package.json` 新增脚本：
```jsonc
{
  "scripts": {
    "l23": "tsx 23-embeddings/embeddings.ts",
    "l23:sim": "tsx 23-embeddings/similarity.ts",
    "l24": "tsx 24-rag-memory/rag-memory.ts",
    "l25:create": "tsx 25-vector-store/create-store.ts",
    "l25:query":  "tsx 25-vector-store/query-store.ts",
    "l26": "tsx 26-file-search/file-search.ts",
    "l27": "tsx 27-rag-express/server.ts"
  }
}
```

`.env` 新增（第 25 课建完库后加）：
```
VECTOR_STORE_ID=vs_xxx
```

---

## 5. 执行顺序（动手时的推进节奏）

1. **Step A** 写 `22-rag-concept/rag-flow.html` + README（讲概念）
2. **Step B** 写 `23-embeddings/*.ts` + README（embeddings 基础）
3. **Step C** 写 5 个 KB markdown（PurrCloud 虚构资料，放在 `24-rag-memory/kb/`）
4. **Step D** 写 `24-rag-memory/rag-memory.ts` + README（手写 RAG）
5. **Step E** 写 `25-vector-store/{create,query}-store.ts` + README（云向量库）
6. **Step F** 写 `26-file-search/file-search.ts` + README（一行 tool RAG）
7. **Step G** 写 `27-rag-express/server.ts` + README（HTTP API）
8. **Step H** 更新根 `README.md` 加 22~27 行 & `package.json` 加 scripts
9. **Step I** `pnpm typecheck` 全绿

**验证策略**：
- Typecheck：全程保证 `pnpm typecheck` 通过
- 运行时：24/25/26/27 都需要真 OPENAI_API_KEY + 网络；提供清晰的 README 命令让用户自己跑
- 若用户能跑通 `l25:create`，则 25→26→27 链路全开

---

## 6. 常见坑（给学生准备的）

| 坑 | 说明 |
|---|---|
| embedding 模型不一致 | ingest 和 query 必须用**同一个模型**，不然向量空间对不上 |
| chunk 切得太大 | 噪声多、检索不准；太小又丢语义。默认 800/400 通常够用 |
| top-K 越大越好？ | 不是。K=3~5 常常优于 K=10；K 大会稀释相关信号 |
| vector store 忘了过期 | 不删就一直计费；`expires_after` 是保险丝 |
| file_search 没带 `include` | 只拿得到答案 + citations，看不到检索到的原文 chunk |
| 用 `user_data` 还是 `assistants`？ | 本课统一用 `purpose: "assistants"`，兼容 vector_stores |

---

完成后，课程目录就从 21 节变 27 节，**完整覆盖从 generation → memory → tool → agent → stateful → streaming → durable → truncation → compaction → RAG** 的全链路。
