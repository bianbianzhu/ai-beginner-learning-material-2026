# AI in 2026 · Hands-on Lab

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

## 学习路径

**建议按 01 → 13 顺序，每一课都是上一课的"加一点点"。**
每节课对应一个独立目录，代码尽量短，注释尽量密。

## 关键 2026 要点

- 用 **Responses API**（`openai.responses.create`），不用旧的 Chat Completions
- `system` 角色 → `developer` 角色（或直接用 `instructions` 参数）
- 工具调用的 output item 类型：`function_call` / `function_call_output`
- 结构化输出：`text: { format: zodTextFormat(schema, name) }` + `responses.parse()`
