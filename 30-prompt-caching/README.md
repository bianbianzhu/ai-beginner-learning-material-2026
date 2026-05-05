# Lesson 30 · Prompt Caching

## 🎯 本课学完后你会
- 知道 Prompt Caching 是**自动启用、零成本、不需要任何代码改动**
- 学会读 `usage.prompt_tokens_details.cached_tokens` 来证明缓存命中
- 掌握「静态前缀放前面，动态内容放后面」的关键原则
- 知道什么时候用 `prompt_cache_key` 影响路由

## 📦 目录结构
```
30-prompt-caching/
  fake-kb.ts        # ~2000 token 假知识库（一节自用，不跨节复用）
  cache-hit.ts      # cold vs warm 对比
  cache-key.ts      # prompt_cache_key 演示
  prefix-order.ts   # 顺序对命中的影响
  README.md
```

## 🚀 运行
```bash
pnpm l30          # cache-hit
pnpm l30:key      # prompt_cache_key
pnpm l30:order    # 顺序错 vs 顺序对
```

## 📖 Prompt Caching 是什么

OpenAI 的 [Prompt Caching 指南](https://developers.openai.com/api/docs/guides/prompt-caching) 一句话总结：

> Prompt Caching can reduce latency by up to 80% and input token costs by up to 90%.
> Prompt Caching works automatically on all your API requests (no code changes required).

工作原理：你的 prompt 越过 1024 tokens 后，OpenAI 会按前缀 hash 把请求路由到一台机器，
那台机器把该前缀的中间状态（KV tensor）缓存住。下次同样的前缀来，命中缓存就直接拿来用，
跳过了重新「读」整个 prompt 的过程。

### 关键事实

| 事实 | 含义 |
|---|---|
| ≥ 1024 tokens 才启用 | 短 prompt 永远 `cached_tokens=0` |
| 前缀必须**完全一致** | 静态内容放前面，动态内容放后面 |
| 自动 + 免费 | 不用配置、不收费 |
| 默认 in-memory，5–10 分钟过期 | 高频系统会持续命中 |
| `prompt_cache_retention: "24h"` | gpt-5.4 / gpt-5.5 等支持的模型可显式延长 |
| `prompt_cache_key` | 影响路由，让多租户场景更稳定命中 |

### 怎么读「命中率」

```ts
const resp = await client.responses.create({...});
const inputTokens   = resp.usage?.input_tokens ?? 0;
const cachedTokens  = resp.usage?.prompt_tokens_details?.cached_tokens ?? 0;
const hitRatio      = cachedTokens / inputTokens;
```

`prompt_tokens_details.cached_tokens` 才是命中数；`input_tokens` 是总 prompt 长度。

## 🔑 常见坑

- **错把动态内容放前面**：每次的「前缀」都变了，缓存全废。`prefix-order.ts` 就是演示这个。
- **把 prompt 拆得太细碎**：每次都构造略微不同的 system prompt，命中不到。
- **凭单次跑分下结论**：缓存默认 5–10 分钟过期，连续跑两次能看到效果，间隔半小时可能就不行了。
- **以为传了 key 就一定命中**：`prompt_cache_key` 只是「影响路由」，不是「强制命中」；前缀本身不一致还是不会命中。

## 🧠 适用场景

- ✅ 系统 prompt 很长且固定（agent、客服、专业助手）
- ✅ Few-shot 示例固定不变
- ✅ RAG 中「指令 + 检索结果」是稳定结构（指令在前，检索结果在后）
- ❌ 完全个性化的 prompt（每次都不一样）—— 那就别强求命中

## ⏭️ 下一节
[Lesson 31 — Make Fewer Requests](../31-fewer-requests/)：另一个减少 input token 处理量的角度——别发那么多请求。
