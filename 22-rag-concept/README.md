# Lesson 22 · RAG 是什么？为什么需要向量数据库？

> 这是一节**概念课**，没有代码。请直接浏览器打开 [`rag-flow.html`](./rag-flow.html)。

## 本课要回答的 3 个问题

1. **什么是 RAG？** Retrieval-Augmented Generation — 先查资料，再回答。
2. **为什么需要向量数据库？** 因为 LLM 只懂 "语义像不像"，不懂 "关键词相等"。传统 DB 查不了"意思接近"。
3. **在 2026 的 OpenAI 生态里，我该自己搭还是用原生？** 有两条路：
   - 🧠 **Memory 版**（第 24 课）：几十行 TypeScript 手写，理解机制
   - ☁️ **OpenAI Vector Store 版**（第 25–27 课）：托管方案，一行 tool 就搞定

## 为什么不用 MySQL / MongoDB 存向量？

传统数据库查的是「值相等」（关键词、ID、条件）。向量数据库查的是「语义像不像」（cosine / 内积）。
一条 `WHERE text LIKE '%配送%'` 查不出来 "什么时候会送到" —— 但 embedding 能。

## OpenAI 2026 的 RAG 三件套

| 层 | API |
|---|---|
| 文字 → 向量 | `client.embeddings.create({ model: "text-embedding-3-small", input })` |
| 向量库 | `client.vectorStores.create / files / search` |
| LLM 自动检索 | `tools: [{ type: "file_search", vector_store_ids: [...] }]` |

## 常见坑

| 坑 | 说明 |
|---|---|
| ingest 用小模型，query 用大模型 | 向量空间不一致，检索结果全是噪声 |
| chunk 切太大 | 噪声多、检索不准 |
| chunk 切太小 | 失去语义，retrieve 回来的片段看不懂 |
| Top-K 设太大 | 稀释相关信号、浪费 token |
| 忘了删 vector store | 一直计费（用 `expires_after` 作保险） |

## 下一步

- [ ] 浏览器打开 `rag-flow.html`，读完整张图
- [ ] 继续 `pnpm l23`（亲手看一眼 embedding 长什么样）
