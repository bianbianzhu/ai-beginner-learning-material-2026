# Lesson 23 · Embeddings 基础

> 把文字变成 "能算距离" 的向量。这是所有 RAG 的第一步。

## 运行

```bash
pnpm l23           # 看一段话的 embedding 向量长什么样
pnpm l23:sim       # 看 "语义相似度" 是怎么算出来的
```

## 核心代码（8 行就够）

```ts
const { data } = await client.embeddings.create({
  model: "text-embedding-3-small",
  input: "今天天气真好",
});
const vector = data[0].embedding;   // number[] of length 1536
```

支持**批量**：`input: ["a", "b", "c"]` 一次调用返回 3 个向量，省一大半 HTTP 开销。

## 一张表看清楚

| 模型 | 维度 | 每美元 pages | 适用场景 |
|---|---|---|---|
| `text-embedding-3-small` | 1536 | ~62,500 | 默认就选它 |
| `text-embedding-3-large` | 3072 | ~9,615 | 精度敏感场景 |
| `text-embedding-ada-002` | 1536 | ~12,500 | **不推荐**（旧版，已被 -3 系列全面超越） |

## 重要：OpenAI embedding 已经归一化

这意味着：
- `cosine(a, b) === dot(a, b)` —— 省掉 `/ (||a|| * ||b||)` 的开销
- 也就意味着**你可以写一个只用 `+` 和 `*` 的一行 `for` 循环**完成相似度计算：
  ```ts
  function cosine(a: number[], b: number[]) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }
  ```

## 降维省钱：`dimensions` 参数

```ts
await client.embeddings.create({
  model: "text-embedding-3-small",
  input: "...",
  dimensions: 512,   // 默认 1536，传 512 就截短（精度有损但小很多）
});
```

> 2026 开源库（比如 pgvector）对超过 2000 维的向量 ANN 索引支持一般。
> 对 `text-embedding-3-large`（3072 维）通常建议降到 1536 甚至 1024。

## 常见坑

| 坑 | 解法 |
|---|---|
| ingest 用 small、query 用 large | 向量空间不一致 → 必须改成同一个模型 |
| 中英混合文本相似度偏低 | 这是正常的，考虑把 query 翻译成和文档一致的语言，或用 large 模型 |
| 忘了归一化就算余弦 | OpenAI 已归一化，别重复 normalize（等价但浪费算力） |

## 下一步

`pnpm l24` —— 亲手写一个 **100 行内** 的完整 RAG（内存版）。
