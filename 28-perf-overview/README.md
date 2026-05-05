# Lesson 28 · 性能优化总览

## 🎯 本课学完后你会
- 知道一次 AI 请求的「时间都花在哪」
- 学会 OpenAI 官方推荐的 [7 个 latency 原则](https://developers.openai.com/api/docs/guides/latency-optimization)
- 掌握「先看指标再优化」的工程纪律

## 📖 这节课没有可跑的脚本

打开 `perf-flow.html` 看图就行：
- macOS 直接 `open 28-perf-overview/perf-flow.html`
- 或者用 VS Code Live Server（项目已经在 `.vscode/settings.json` 里配置了 5501 端口）

## 📖 一句话主旨

> AI 慢，大多不是算力问题，而是系统设计问题。

很多新手第一反应是「换个更大的模型？」、「调温度？」，结果发现产品上线后用户的真实评价是：

> 功能不错，就是有点慢。

在真实产品里，这句话往往等于：**这个功能可能活不下来。**

## 📖 拆解一次完整的 AI 请求

```
用户发起 → 后端校验 → RAG embed → 向量搜索 → 构造 prompt → LLM 生成 → SSE 推流 → 前端渲染
```

每一步都是潜在的性能瓶颈。**LLM 生成那一步往往占总时间的 60%-80%**，但你能优化的地方远不止那一步。

## 📖 OpenAI 官方的 7 个原则

| # | 原则 | 一句话 | 这个 mini-arc 哪节讲 |
|---|---|---|---|
| 1 | Process tokens faster | 用更小的模型 / 推理优化 | 28 概念 |
| 2 | Generate fewer tokens | 输出越短越快 | 28 概念 |
| 3 | Use fewer input tokens | Prompt Caching：静态前缀在前，动态在后 | **Lesson 30** |
| 4 | Make fewer requests | 能合并的多步合并 | **Lesson 31** |
| 5 | Parallelize | `Promise.all` 走起 | **Lesson 31** |
| 6 | Make your users wait less | Streaming + Loading + 显示进度 | **Lesson 29 + 32** |
| 7 | Don't default to an LLM | 能写死/预算/hash 的别叫 LLM | 28 概念 |

## 📖 决策框架：什么场景用哪个？

```
你的瓶颈是什么？
├─ 用户主观觉得慢 → Streaming (#6) + Loading 状态
├─ 同样的 prompt 重复发 → Prompt Caching (#3)
├─ 多步推理 round-trip 多 → Combine (#4) 或 Parallelize (#5)
├─ 输出太长 → 让模型简洁 (#2) / 缩短 JSON key
├─ 模型本身慢 → 换更小的模型 (#1) / Predicted Outputs
└─ 这事根本不需要 LLM → Don't default to an LLM (#7)
```

## 📖 这个课程不会讲的（但你应该知道）

- **Predicted Outputs** (#1 的具体实现): 只在 Chat Completions API 上、特定模型 (gpt-4.1 系列) 支持。
  本课程整套都用 Responses API + gpt-5.4-nano，所以暂时不演示。
  详情: [Predicted Outputs 文档](https://developers.openai.com/api/docs/guides/predicted-outputs)
- **Batch API**: 异步批处理，不适合 chat 这种「让用户感觉快」的场景。属于成本优化范畴。
- **限流、重试、降级**: 属于 production reliability。本课的 Safety arc (Lesson 33+) 会专门讲。

## 🔑 常见坑

- **过早优化**：还没上线就琢磨怎么省 200ms，时间花得不值。
- **没有指标**：「我感觉变快了」不算数据。要测 TTFT、Total、cached_tokens、token/s。
- **为了快牺牲准确性**：合并 prompt 把模型搞糊涂了，这种「快」是减分项。
- **优化错地方**：embed 已经只占总时长 2% 了还在优化它。

## 🧠 适用场景

任何要给真用户用的 AI 产品。**只要有人会等你的回复，就值得优化感知速度。**

## ⏭️ 下一节
[Lesson 29 — 流式响应与 TTFT 测量](../29-streaming-ttft/) — 先把「测量」工具立起来。
