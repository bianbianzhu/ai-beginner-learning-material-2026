# Lesson 32 · 性能优化 Web Demo

## 🎯 本课学完后你会
- 把 streaming 在真前端里跑出来，亲眼看到「感知速度」的差距
- 用 Express SSE 把 OpenAI 的 streaming events 转出去
- 用 React 19 + Vite 6 写一个 split-screen UX 对比页

## 📦 目录结构
```
32-perf-web-demo/
  server/
    server.ts          # POST /api/chat/slow + /api/chat/fast
  web/
    src/
      App.tsx          # 左右分栏，一个 Composer 同时发两路
      hooks/
        useSlowChat.ts       # fetch → 等整段 JSON
        useStreamingChat.ts  # SSE → 增量 setState
      components/
        Composer / MessageList / Bubble / StatsBar
  README.md
```

## 🚀 运行
```bash
# 终端 A
pnpm l32:server

# 终端 B
pnpm l32:web

# 浏览器打开 http://localhost:5173
```

## 📖 这节课在演示什么

[Lesson 29](../29-streaming-ttft/) 用 CLI 看了 TTFT 和 Total 的数字差距，但**这种差距只有在真用户面前才能感同身受**。

这节课就是把那种感受做成可以亲眼看到的：

- 一个输入框，按下发送，**同一个问题同时发给 /slow 和 /fast**
- 左边「Slow」转圈干等 ~5 秒后整段刷出来
- 右边「Fast」~0.6 秒就开始飙字

总耗时几乎一样，但用户体验**完全不在一个时代**。

## 📖 SSE 在 Express v5 里怎么写

```ts
res.setHeader("Content-Type", "text/event-stream");
res.setHeader("Cache-Control", "no-cache");
res.flushHeaders();

const send = (event: string, data: unknown) => {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
};

for await (const ev of openaiStream) {
  if (ev.type === "response.output_text.delta") send("delta", { text: ev.delta });
  if (ev.type === "response.completed") {
    send("done", { ttft_ms, total_ms, output_tokens });
    res.end();
  }
}
```

前端用 `fetch().body.getReader()` 读流，按 `\n\n` 切帧，挑出 `event:` 和 `data:` 字段。
完整代码看 `web/src/hooks/useStreamingChat.ts`。

## 🔑 常见坑

- **忘了 `res.flushHeaders()`**：浏览器会等到 buffer 满或服务端 `res.end()` 才能拿到第一个字节，TTFT 直接报废
- **CORS / proxy 配错了**：Vite 已经在 `vite.config.ts` 里把 `/api` 代理到 3000，不用动；如果换了端口要同步改
- **response.output_text.delta 写错事件名**：仔细看 [streaming events 文档](https://developers.openai.com/api/docs/guides/streaming-responses)
- **客户端断开后服务端还在读 stream**：生产里要监听 `res.on("close")` + 用 AbortController 取消上游
- **流式情况下做 moderation 更难**：见官方文档「Moderation risk」一节

## 🧠 适用场景
- ✅ 任何用户面对的 chat / 文档生成 / 长答案场景
- ✅ Agent 工作流，把每一步「在干啥」实时推给前端
- ❌ 后端→后端调用（流式只让事情更复杂）

## ⏭️ 下一节
回到 [Lesson 28 · 性能优化总览](../28-perf-overview/) 看完整的 7 原则地图，
或继续 [Lesson 33 · Threat Model](../33-threat-model/) 进入 Safety 章节。
