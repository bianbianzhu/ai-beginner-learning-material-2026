# Lesson 26 · file_search hosted tool

> **最省事的 RAG 接入方式**。Responses API 里加一行 tool，其他都不用写。

## 前置

必须先跑完第 25 课，`.env` 里有 `VECTOR_STORE_ID=vs_xxx`。

## 运行

```bash
pnpm l26
pnpm l26 "配送多久能到？"
pnpm l26 "可以暂停订阅吗？"
pnpm l26 "首次订阅 7 天无理由怎么操作？"
```

## 和第 25 课的区别

| 第 25 课（`client.vectorStores.search`） | 第 26 课（`file_search` tool） |
|---|---|
| 你自己调 search | 模型自己决定要不要查、查什么 |
| 自己拼 context 再调 LLM | 一个 API 调用就返回答案 + citations |
| 可以打印中间步骤 | 通过 `include: ["file_search_call.results"]` 也能看到 |
| 完全可控 | 更简洁、更智能（model 可以多跳检索） |

## 核心代码

```ts
const resp = await client.responses.create({
  model: "gpt-5.4-nano",
  input: question,
  tools: [{
    type: "file_search",
    vector_store_ids: [vsId],
    max_num_results: 3,
  }],
  include: ["file_search_call.results"],   // 想看原文必须加
});
```

## response.output 的结构

Responses API 会返回**多个 output item**，file_search 场景下典型顺序：

```jsonc
[
  {
    "type": "file_search_call",
    "id": "fs_xxx",
    "queries": ["配送频率", "每月配送次数"],
    "status": "completed",
    "results": [
      { "file_id": "file_xxx", "filename": "purrcloud-shipping.md", "score": 0.73, "text": "..." }
    ]
  },
  {
    "type": "message",
    "content": [
      {
        "type": "output_text",
        "text": "PurrCloud 每月配送 2 次，分别在 ...",
        "annotations": [
          { "type": "file_citation", "file_id": "file_xxx", "filename": "purrcloud-shipping.md", "index": 0 }
        ]
      }
    ]
  }
]
```

`file_citation` 的 `index` 是**在文本中插入位置的字符下标**，UI 层可以据此高亮 + 给链接。

## 三个调优旋钮

| 参数 | 作用 | 推荐值 |
|---|---|---|
| `max_num_results` | 给模型看多少个 chunk | 3~5（越多越慢越贵） |
| `filters` | 按 vector_store_file 的 attributes 过滤 | 有 metadata 时再用 |
| `ranking_options.score_threshold` | 过滤掉低于阈值的 chunk | 0.5~0.7 常用 |

## 常见坑

| 坑 | 说明 |
|---|---|
| 不传 `include` | 只能看答案和引用，看不到检索的原文（debug 没法做） |
| `vector_store_ids` 漏传 | tool 无库可查，模型会瞎答 |
| instructions 不约束 | 模型可能不调用 tool 直接用自己的知识答 |
| 一次给太多 `vector_store_ids` | tool call 会变慢；可考虑多 tool 或先用 routing |

## 下一步

`pnpm l27` —— 把这一课包成真 HTTP API，前端就能直接调了。
