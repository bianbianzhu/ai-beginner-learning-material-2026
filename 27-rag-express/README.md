# Lesson 27 · RAG Express API（把 file_search 包成 HTTP 服务）

> 第 13 课（stateful Express）+ 第 26 课（file_search tool）的**综合应用**。
> 这一课结束，课程从 "generation" 走到了真正的 "production-like RAG service"。

## 前置

- 完成第 25 课，`.env` 里有 `VECTOR_STORE_ID`
- 可选：调过一次 `pnpm l26` 确认 file_search 能工作

## 运行

```bash
pnpm l27
```

## 测试

```bash
# 健康检查
curl -s http://localhost:3000/healthz | jq

# 真实查询
curl -s -X POST http://localhost:3000/api/rag \
     -H "Content-Type: application/json" \
     -d '{"question":"PurrCloud 每月配送几次？"}' | jq

# 返回示例
{
  "success": true,
  "data": {
    "answer": "PurrCloud 每月配送 2 次 ...",
    "citations": [
      { "filename": "purrcloud-shipping.md", "file_id": "file_xxx", "index": 34 }
    ],
    "usage": { ... }
  }
}
```

## 设计要点

### 1. 错误格式统一
和前面课程一致：
```ts
{ success: false, error: "..." }
{ success: true, data: { ... } }
```
前端看到 `success: false` 就展示错误，不用解析多种 HTTP code。

### 2. citations 单独返出来
虽然 `answer` 里模型已经把引用编号 `[1] [2]` 插入了文字，但**把 citation 数组单独返回**让前端能：
- 渲染"参考资料"区块
- 点击引用跳转到原文 chunk
- 把 `file_id` 传给另一个 `/files/retrieve` 接口展示完整文件

### 3. 单条路由，多种问题共用
这里**没有**做 session。相同的 `VECTOR_STORE_ID` 能回答所有 PurrCloud 相关问题 —— knowledge base 是共享的，session 只影响对话历史。

## 加多轮对话？两条路

**A. previous_response_id**（最简单）：
```ts
const resp = await client.responses.create({
  model: "gpt-5.4-nano",
  input: question,
  tools: [...],
  previous_response_id: lastResponseId,   // 让 OpenAI 自动带上历史
});
```
存一个 `sessionId → lastResponseId` 的 Map 就行（参考第 15 课）。

**B. 手动维护 history**（和第 13 课一样）：
```ts
const resp = await client.responses.create({
  input: [...history, { role: "user", content: question }],
  tools: [...],
});
```

两种方案都不会丢 file_search 的上下文 —— tool 是**每轮独立执行**的。

## 生产部署清单

| 项 | 建议 |
|---|---|
| Rate limit | `express-rate-limit`，每 IP 每分钟 10 条 |
| Auth | JWT / API key，**不要裸暴露** |
| Logging | 把 `resp.id` + `question` + `usage` 写到日志，便于后续评估检索质量 |
| Metrics | 把 `usage.total_tokens` 导到 Prometheus |
| Vector store 管理 | 定时全量 re-ingest（文档更新时）；保留版本号 |
| 缓存 | 对**高频重复问题**做短时缓存（`answer` 层，别缓 embedding） |

## 课程结尾

到这里，你已经从第 01 课的 `hello openai` 一路走到了**一个有长期记忆、能查资料、带引用的 RAG 后端**。

下一步可以做的练习：
- [ ] 加一个 React 前端（参考第 14 课的 Vite + SSE），把 RAG 答案流式显示
- [ ] 把 `/api/rag` 接到第 19 课的 SQLite，记录每个问题的答案和 user feedback
- [ ] 加一个 admin 路由 `/api/kb/reindex` 触发 vector store 的重建
- [ ] 评估：准备 20 个 Q/A 对，跑脚本看 RAG 的答对率
