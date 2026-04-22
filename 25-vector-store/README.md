# Lesson 25 · OpenAI 托管的 Vector Store

> 把第 24 课的"内存数组"升级成**云上的向量库**。
> 从这一课开始进入"免费云版"路线。

## 顺序

```bash
pnpm l25:create                               # 只跑一次，把 KB 搬到云上
# 输出 VECTOR_STORE_ID=vs_xxx → 加到 .env
pnpm l25:query                                # 只检索，不调 LLM
pnpm l25:query "幼猫三个月能订吗？"
```

## OpenAI 帮你做了哪些？

第 24 课学生亲手写的 **"切段 + embed + cosine + top-K"**，这一课全部变成：

```ts
await client.vectorStores.create({ name, file_ids });   // ↓
//      ↓ OpenAI 内部自动：
//      切块（800 tokens / 400 overlap）
//      → 调 embedding
//      → 建 ANN 索引

await client.vectorStores.search(vsId, { query });      // ↓
//      ↓ OpenAI 内部自动：
//      query rewrite（可选）
//      → query embed
//      → top-K ANN
//      → 返回 content + score + filename
```

## `expires_after` —— 别忘了省钱

```ts
expires_after: { anchor: "last_active_at", days: 7 }
```
这个字段让 "7 天没访问的库" 自动删除 —— 教学场景非常适合。
真实项目按业务生命周期配置（比如 30 天、90 天）。

**价格表**：
| 用量 | 价格 |
|---|---|
| 前 1 GB（所有库总和） | 免费 |
| 超出部分 | $0.10 / GB / 日 |

5 个 PurrCloud 的 markdown 文件，加起来 usage_bytes 大约在 **10~50 KB** 级别，几十年也超不过 1 GB。

## `rewrite_query: true` 是白送的

用户问 "我想知道那个啥配送什么时候送啊"
rewrite 后 → "配送时间"
再去检索 → top 结果更准。几乎不加成本，默认就开。

## 进一步控制：`chunking_strategy` 和 `filters`

```ts
// 自定义切块（默认 800/400）：
await client.vectorStores.create({
  name: "my-kb",
  file_ids,
  chunking_strategy: {
    type: "static",
    static: { max_chunk_size_tokens: 400, chunk_overlap_tokens: 100 },
  },
});

// attribute 过滤（需要先给 vector_store_file 设 attributes）：
await client.vectorStores.search(vsId, {
  query: "...",
  filters: { type: "eq", key: "lang", value: "zh" },
});
```

## 常见坑

| 坑 | 说明 |
|---|---|
| `purpose` 传错 | 上传时必须用 `"assistants"`（或 `"user_data"`），不能用 `"fine-tune"` 之类 |
| 没等索引完成就查 | `status !== "completed"` 时查不到结果。本课用 `while` 轮询 |
| 忘了 `expires_after` | 账单会一直跑。即便没超过 1 GB 也建议设置，防止忘记库的存在 |
| VECTOR_STORE_ID 漏改 `.env` | 26、27 课跑不起来 |

## 下一步

`pnpm l26` —— 让 LLM **自己去** search 这个库，一行 tool 搞定 RAG。
