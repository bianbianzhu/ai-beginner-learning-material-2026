# Lesson 31 · 减少请求次数与并行

## 🎯 本课学完后你会
- 学会把多个顺序请求合并成 1 个 JSON 输出
- 用 `Promise.all` 把互相独立的请求并行发出
- 知道这两种优化的适用边界

## 📦 目录结构
```
31-fewer-requests/
  combine.ts    # 2 次顺序 → 1 次合并 (Make fewer requests)
  parallel.ts   # 3 次顺序 → 3 次并行 (Parallelize)
  README.md
```

## 🚀 运行
```bash
pnpm l31           # combine
pnpm l31:parallel  # parallel
```

## 📖 OpenAI 官方原则 #4 + #5

[Latency optimization 指南](https://developers.openai.com/api/docs/guides/latency-optimization) 里的 7 个原则中:
- **#4 Make fewer requests**：每次 API 调用都有固定 round-trip 开销，把能合并的合并掉。
- **#5 Parallelize**：互相独立的步骤别按顺序等，`Promise.all` 走起。

> Two shirts take just as long to dry as one.

### 何时合并 (combine.ts)

- 多步推理是「线性的」：第 1 步的输出会被第 2 步用
- 把「先改写、再回答」这类两步搞成一个 prompt，要求模型按 JSON 返回 `{step1, step2}`

### 何时并行 (parallel.ts)

- 多步推理是「独立的」：步骤之间互不依赖
- 比如：同时跑情感分类 + 语种识别 + 主题标签

## 🔑 常见坑
- **盲目合并损害质量**：模型一次想 3 件事会变蠢，要测试。
- **盲目并行触发 rate limit**：并行度高了会被 429，并发数要受控（这个话题留到 safety 章节 35 重试与限流）。
- **以为并行就一定快**：如果模型本身就慢、单次延迟大，并行只是把「等」摊到多任务上。

## 🧠 适用场景
- ✅ Combine: 客服/搜索的「query 重写 + 应答」、Agent 的「思考 + 决策」单步合并
- ✅ Parallel: 多分类、多翻译、多语言并发响应
- ❌ 单步任务、强依赖任务

## ⏭️ 下一节
[Lesson 32 — 性能优化 Web Demo](../32-perf-web-demo/)：把前面学的全部优化在一个真前端里展示出来。
