# Lesson 29 · 流式响应与 TTFT 测量

## 🎯 本课学完后你会
- 理解 **TTFT (Time To First Token)** 和总耗时 (Total) 的区别
- 用 `stream: true` 让 Responses API 边生成边返回
- 自己测量并对比 baseline / streaming 两种调用方式

## 📦 目录结构
```
29-streaming-ttft/
  baseline.ts   # 非-streaming，看 Total
  streaming.ts  # streaming，看 TTFT + Total
  README.md
```

## 🚀 运行
```bash
pnpm l29:baseline   # 先跑这个，看 Total 是多少
pnpm l29            # 再跑这个，看 TTFT 多快出现
```

## 📖 为什么要关心 TTFT

OpenAI 官方的 [latency optimization 指南](https://developers.openai.com/api/docs/guides/latency-optimization) 把
streaming 列为「让用户少等」最有效的一招——原因不在于让模型生成得更快，而在于**让用户更早看到反馈**。

> Streaming: The single most effective approach, as it cuts the waiting time to a second or less.

体验速度 ≠ 实际计算速度：
- baseline 让用户干等 5 秒，5 秒后整段刷出来
- streaming 让用户 0.6 秒就开始看到字，5 秒后整段同样结束

总耗时几乎相同，**用户感受天差地别**。

### 关键事件 (Responses API)

```ts
const stream = await client.responses.create({ model, input, stream: true });
for await (const ev of stream) {
  if (ev.type === "response.output_text.delta") {
    // 第一次拿到 delta = TTFT 时刻
  }
  if (ev.type === "response.completed") {
    // 拿 usage、finish reason 等
  }
}
```

完整事件类型见 [streaming responses 文档](https://developers.openai.com/api/docs/guides/streaming-responses)。

## 🔑 常见坑
- `for await` 的循环里别 `console.log(ev)` 打印整个事件——刷屏且分不清节奏
- TTFT 和模型大小、Prompt 长度、Prompt Caching 是否命中都有关；不要拿一次跑的数字下定论
- 生产环境里要把 streaming 拆出 SSE 通道（参考 Lesson 14 / 32）

## 🧠 适用场景
- ✅ 任何用户面对的 chat / 长答案场景
- ✅ 需要展示「思考中」状态的复杂任务
- ❌ 调用方是另一个程序而不是人（streaming 反而让代码更复杂）

## ⏭️ 下一节
[Lesson 30 — Prompt Caching](../30-prompt-caching/)：另一种「让用户少等」的方法，但攻击的是 input 端。
