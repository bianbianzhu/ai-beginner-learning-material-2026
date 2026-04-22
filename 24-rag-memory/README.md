# Lesson 24 · Memory RAG（手写最小可跑版）

> 100 行以内，把第 22 课的图**变成代码**。

## 运行

```bash
pnpm l24                                     # 默认问题
pnpm l24 "PurrCloud 每月配送几次？"
pnpm l24 "幼猫三个月能订吗？"
pnpm l24 "什么时候可以退款？"
```

## 核心 5 步

```
读 KB → 切段 → 批量 embed → cosine Top-K → Responses API
```

每一步都在 `rag-memory.ts` 里裸露给学生看，没有任何封装。

## 为什么叫 "Memory" RAG？

因为向量 + 原文**只活在当前进程的数组里**：
```ts
const docVecs: number[][] = [...];
const chunks:  { text, source }[] = [...];
```
进程退出 = 一切丢失。重启 = 重新 embed。

## 优缺点

| 优 | 缺 |
|---|---|
| ✅ 零外部依赖 | ❌ 重启丢数据 |
| ✅ 本地调试方便 | ❌ 文件多了 embed 一次要几秒 |
| ✅ 隐私极佳（不上云） | ❌ 没有 metadata 过滤 |
| ✅ 所有逻辑可见 | ❌ 不会自动去重、rewrite_query |

## Chunker 策略

本课用了最粗暴的 **"按空行切段"**：
```ts
content.split(/\n{2,}/)
```
真实项目可能需要：
- 按 token 数切（`800 tokens / 400 overlap` 是默认推荐）
- 按 markdown header 切
- 按句子切（`compromise` / `blingfire` / 中文 `jieba`）

第 25 课的 OpenAI Vector Store 会自动按 token 数切，学生不用自己操心。

## 常见坑

| 坑 | 说明 |
|---|---|
| 文件里段落太短 | 被过滤掉 → 信息丢失。本课的阈值是 `length >= 30` |
| Top-K 设太大 | K=3 常常优于 K=10。token 贵且噪声多 |
| Query 太口语化 | "我今天想问下那个啥" 检索会很差。第 25 课的 `rewrite_query: true` 会自动改写 |
| instructions 忘了加"仅基于资料" | 模型会**从自己的记忆里补**，产生幻觉 |

## 下一步

`pnpm l25:create` —— 把 KB 搬到 OpenAI 托管的 vector store 上。
