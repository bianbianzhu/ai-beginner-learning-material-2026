# AI in 2026 · Hands-on Lab

[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc/4.0/)

零 AI 经验 → 会用 **OpenAI Responses API (2026)** + **TypeScript** + **Express** 写产品级 AI 服务。

## 前置

```bash
# 1. 安装依赖
pnpm install

# 2. 配置 API Key
cp .env.example .env
# 编辑 .env，填入 OPENAI_API_KEY
```

默认模型：`gpt-5.4-nano`（便宜、快、Responses API 全支持）。

## 课程目录

| # | 内容 | 运行 |
|---|------|------|
| 01 | 第一个 OpenAI 调用 | `pnpm l1` |
| 02 | System prompt / `instructions` | `pnpm l2` |
| 03 | 用 array 做短期记忆 | `pnpm l3` |
| 04 | Response 数据结构解剖（usage, metadata） | `pnpm l4` |
| 05 | temperature & top_p （**概念课**，看 README） | `05-temperature-topp/README.md` |
| 06 | Structured Output (zod) | `pnpm l6` |
| 07 | Tool calling (单轮) | `pnpm l7` |
| 08 | ReAct loop 可视化 | 浏览器打开 `08-react-loop-concept/react-loop.html` |
| 09 | Context window 可视化 | 浏览器打开 `09-context-window/context-window.html` |
| 10 | Express 单轮 summarize API | `pnpm l10` |
| 11 | Readline 多轮 CLI 对话 | `pnpm l11` |
| 12 | CLI Agent（完整 ReAct loop + 工具） | `pnpm l12` |
| 13 | Express 有状态 API（sessionId + cookie） | `pnpm l13` |
| 14 | **Streaming Chat**（Vite+React 前端 + SSE + 流式 tool calling） | `pnpm l14:server` + `pnpm l14:web` |
| 15 | `previous_response_id` 服务端对话链 | `pnpm l15:demo` / `pnpm l15` |
| 16 | Conversations API（持久化对话，无 TTL） | `pnpm l16` |
| 17 | Truncation（自动截断安全网） | `pnpm l17` |
| 18 | Compaction（上下文智能压缩） | `pnpm l18:manual` / `pnpm l18:auto` |
| 19 | DB-backed Conversations（SQLite + Drizzle） | `pnpm l19` |
| 20 | Agents SDK Sessions（Memory / Conversations / Compaction） | `pnpm l20:memory` / `pnpm l20:conv` / `pnpm l20:compact` |
| 21 | **上下文策略总览与对比**（概念课） | `21-context-strategies-overview/README.md` |
| 22 | **RAG 概念**可视化（Ingest + Query 两条流水线） | 浏览器打开 `22-rag-concept/rag-flow.html` |
| 23 | Embeddings 基础（文字 → 向量 + 相似度） | `pnpm l23` / `pnpm l23:sim` |
| 24 | **Memory RAG**：手写最小可跑版（100 行内） | `pnpm l24` |
| 25 | **OpenAI Vector Store**（托管云向量库，前 1 GB 免费） | `pnpm l25:create` → `pnpm l25:query` |
| 26 | `file_search` hosted tool（一行 tool，LLM 自动 RAG） | `pnpm l26` |
| 27 | **RAG Express API**（把 file_search 包成 HTTP 服务 + 引用） | `pnpm l27` |

## 学习路径

**建议按 01 → 13 顺序，每一课都是上一课的"加一点点"。**
每节课对应一个独立目录，代码尽量短，注释尽量密。

## 关键 2026 要点

- 用 **Responses API**（`openai.responses.create`），不用旧的 Chat Completions
- `system` 角色 → `developer` 角色（或直接用 `instructions` 参数）
- 工具调用的 output item 类型：`function_call` / `function_call_output`
- 结构化输出：`text: { format: zodTextFormat(schema, name) }` + `responses.parse()`

## License

本仓库所有内容（代码 + 讲义）采用 **[CC BY-NC 4.0](./LICENSE)** 协议。

- ✅ 可以自由转载、学习、二次创作
- ✅ 转载/引用请**署名** Tianyi Li (bianbianzhu) 并附本仓库链接
- ❌ **禁止任何形式的商业使用**（包括但不限于：打包成付费课程、付费教程、付费专栏等）

有商业合作需求请联系作者。
