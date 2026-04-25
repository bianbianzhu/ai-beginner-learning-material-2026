# Tool Calling 在三套 API 里的消息形态对比

> Lesson 7 补充材料 · 2026-04-25
> 配套代码：`one-tool.ts`（写法 A：手动拼历史） · `one-tool-prev-id.ts`（写法 B：previous_response_id）
>
> 本文经过独立 fact-check，所有断言都附带官方 docs 出处。

---

## TL;DR

| API | tool_call 怎么放 | tool_result 怎么放 |
|---|---|---|
| **OpenAI Responses** | 顶层 input item：`{ type: "function_call", id, call_id, name, arguments }` | 顶层 input item：`{ type: "function_call_output", call_id, output }` |
| **OpenAI Chat Completions** | 包在 assistant message 里：`{ role: "assistant", tool_calls: [{ id, type: "function", function: { name, arguments } }] }` | 独立的 `tool` 角色消息：`{ role: "tool", tool_call_id, content }` |
| **Anthropic Messages** | 包在 assistant message 的 content blocks 里：`content: [{ type: "tool_use", id, name, input }]` | **必须**包在 user message 的 content blocks 里：`content: [{ type: "tool_result", tool_use_id, content }]`，且 tool_result 块**必须排在 content 数组最前面** |

---

## 1. 核心架构差异：Items vs Messages

OpenAI Responses API 的 input/output **不是 messages 数组**，而是 **items 数组**。

> 官方原话（[Migrate to Responses API](https://developers.openai.com/api/docs/guides/migrate-to-responses#messages-vs-items)）：
>
> *"The input to, and result of, a call to Chat completions is an array of **Messages**, while the Responses API uses **Items**. An Item is a union of many types... A `message` is a type of Item, as is a `function_call` or `function_call_output`. Unlike a Chat Completions Message, where many concerns are glued together into one object, **Items are distinct from one another and better represent the basic unit of model context**."*

也就是说：

- **Chat Completions / Anthropic** 是经典聊天模型 —— 一切皆 message，工具是 message 上挂的字段或 content block
- **Responses API** 是事件流模型 —— message、function_call、function_call_output、reasoning、各种 built-in tool call 都是平级的 item，靠 `type` 字段区分

这是理解 Responses API 的最重要心智模型。

---

## 2. OpenAI Responses API · 详解

### 2.1 Item 类型清单

已在官方 docs 中确认存在的 item type：

- `message`（user/assistant/system/developer 内容）
- `function_call`
- `function_call_output`
- `reasoning`（reasoning 模型的思维链 item）
- `web_search_call`
- `file_search_call`
- `custom_tool_call`（自定义文本工具）

> ⚠️ 另外还有 `code_interpreter_call`、`mcp_call` 这类 built-in tool item —— **功能确认存在，但本文档作者未在 docs 里直接核到精确字符串**。建议读者在用到时查 [Responses API reference](https://platform.openai.com/docs/api-reference/responses) 里的 OpenAPI schema 确认。
>
> 心智模型：**每个 built-in tool 在 Responses API 里都对应一种 item type**。

### 2.2 `function_call` 的真实形态

```json
{
  "type": "function_call",
  "id": "fc_0026884a68494b2f0069ec82df4da4819eb610c5af5fa40751",
  "call_id": "call_hqCS50vhFW6WrLS5RSYzITqb",
  "name": "get_weather",
  "arguments": "{\"city\":\"Tokyo\"}",
  "status": "completed"
}
```

**重要：`id` 和 `call_id` 是两个不同的字段，并且都会出现：**

| 字段 | 前缀 | 用途 |
|---|---|---|
| `id` | `fc_` | item 自身的标识（item id） |
| `call_id` | `call_` | 用于和 `function_call_output` 配对的关联 id |

回传 `function_call_output` 时**用 `call_id` 而不是 `id`** 来配对：

```ts
toolOutputs.push({
  type: "function_call_output",
  call_id: call.call_id,        // ✅ 用 call_id
  output: JSON.stringify(result),
});
```

`arguments` 是 **JSON 编码后的字符串**，要 `JSON.parse()` 才能拿到对象。

### 2.3 `function_call_output` 的真实形态

```json
{
  "type": "function_call_output",
  "call_id": "call_hqCS50vhFW6WrLS5RSYzITqb",
  "output": "{\"city\":\"Tokyo\",\"tempC\":18,\"sky\":\"clear\"}"
}
```

> 官方原话（[Function calling guide](https://developers.openai.com/api/docs/guides/function-calling)）：
> *"The result you pass in the function_call_output message should typically be a string... the tool call output should contain a reference to a specific model tool call (referenced by call_id)."*

`output` 必须是字符串（JSON / 纯文本 / 错误码均可，模型自己解析）。如果工具返回图片或文件，可改为 image / file 对象数组。

### 2.4 顶层 item，不需要包 message

`function_call` 和 `function_call_output` 是 input/output 数组里的**顶层 item**，**没有 role 概念**，也**不需要**塞进任何 message 容器：

```ts
const nextInput = [
  { role: "user", content: "What's the weather in Tokyo?" },  // message item
  { type: "function_call", ... },                              // 顶层 item
  { type: "function_call_output", ... },                       // 顶层 item
];
```

---

## 3. OpenAI Chat Completions · 详解

### 3.1 纯 messages 数组

Chat Completions 没有 item 抽象 —— 所有东西必须套 role。

### 3.2 合法的 role 列表

完整 6 个：

- `developer`
- `system`
- `user`
- `assistant`
- `tool`
- `function`（**legacy / deprecated** —— 老的 functions API 用，仍然可用但不推荐）

为新代码只需要前 5 个。

### 3.3 Tool call 的形态（包在 assistant 里）

```json
{
  "role": "assistant",
  "content": null,
  "tool_calls": [
    {
      "id": "call_abc123",
      "type": "function",
      "function": {
        "name": "get_weather",
        "arguments": "{\"city\":\"Tokyo\"}"
      }
    }
  ]
}
```

注意 **`name` 和 `arguments` 是嵌套在 `function` 字段里**的 —— 这跟 Responses API 的扁平结构（`name`、`arguments` 直接挂在 item 上）不一样。

### 3.4 Tool result 的形态

```json
{
  "role": "tool",
  "tool_call_id": "call_abc123",
  "content": "{\"tempC\":18}"
}
```

字段名是 **`tool_call_id`**（注意和 Anthropic 的 `tool_use_id` 区分）。

### 3.5 完整流程示例

```js
[
  { role: "user", content: "weather in Tokyo?" },
  {
    role: "assistant",
    content: null,
    tool_calls: [
      { id: "call_xxx", type: "function", function: { name: "get_weather", arguments: "{\"city\":\"Tokyo\"}" } }
    ]
  },
  { role: "tool", tool_call_id: "call_xxx", content: "{\"tempC\":18}" },
]
```

---

## 4. Anthropic Messages API · 详解

### 4.1 只有两种 role

> 官方原话（[Handle tool calls](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls)）：
>
> *"Unlike APIs that separate tool use or use special roles like `tool` or `function`, the Claude API integrates tools directly into the `user` and `assistant` message structure."*

合法 role 只有 `user` 和 `assistant`。**没有** `tool` role，**没有** `function` role。

### 4.2 Tool use 的形态（assistant content block）

```json
{
  "type": "tool_use",
  "id": "toolu_01A09q90qw90lq917835lq9",
  "name": "get_weather",
  "input": { "location": "San Francisco, CA", "unit": "celsius" }
}
```

注意：

- `input` 是**对象**（不是 JSON 字符串），**和 OpenAI 的 `arguments: "..."` 不一样**
- `id` 前缀是 `toolu_`

### 4.3 Tool result 的形态（user content block）

```json
{
  "type": "tool_result",
  "tool_use_id": "toolu_01A09q90qw90lq917835lq9",
  "content": "..."
}
```

字段名是 **`tool_use_id`**（不是 OpenAI Chat Completions 的 `tool_call_id`）。

### 4.4 ⚠️ Anthropic 的硬性规则

> 官方原话：
>
> *"In the user message containing tool results, the tool_result blocks must come **FIRST** in the content array. Any text must come **AFTER** all tool results."*

**违反这条规则 Anthropic API 直接返回 400**，这不是 convention 而是强约束。

✅ 正确：

```js
{
  role: "user",
  content: [
    { type: "tool_result", tool_use_id: "toolu_xxx", content: "..." },  // 必须在最前
    { type: "text", text: "顺便再问一下..." }                              // 文字在后
  ]
}
```

❌ 报 400：

```js
{
  role: "user",
  content: [
    { type: "text", text: "这是工具结果" },                                // ❌ 文字在前
    { type: "tool_result", tool_use_id: "toolu_xxx", content: "..." }
  ]
}
```

### 4.5 完整流程示例

```js
[
  { role: "user", content: "weather in Tokyo?" },
  {
    role: "assistant",
    content: [
      { type: "text", text: "I'll check..." },
      { type: "tool_use", id: "toolu_xxx", name: "get_weather", input: { city: "Tokyo" } }
    ]
  },
  {
    role: "user",
    content: [
      { type: "tool_result", tool_use_id: "toolu_xxx", content: "{\"tempC\":18}" }
    ]
  },
]
```

---

## 5. 字段名易混表（背下来少踩坑）

| 概念 | OpenAI Responses | OpenAI Chat Completions | Anthropic |
|---|---|---|---|
| 工具调用的关联 id | `call_id` | `tool_call_id` | `tool_use_id` |
| 工具参数 | `arguments`（**JSON 字符串**） | `function.arguments`（**JSON 字符串**） | `input`（**对象**） |
| 工具调用 type 名 | `function_call` | `tool_calls[].type: "function"` | `tool_use` |
| 工具结果 type 名 | `function_call_output` | `role: "tool"` | `tool_result` |

---

## 6. 设计哲学一句话总结

- **OpenAI Responses 的赌注**：模型不仅会产生"消息"，还会产生 reasoning、function_call、web_search、code_interpreter、computer_use 等各种 trace。把它们都用 message 包一层是别扭的（一个 message 里塞 tool_calls + content + reasoning 越来越混乱），不如干脆叫 **item**，让每个事件都是一等公民。

- **OpenAI Chat Completions** 还在沿用经典聊天模型 —— 一切皆 message，工具是 message 上挂的字段。

- **Anthropic Messages** 用 content blocks 缓解了"一个 message 装很多东西"的问题，但仍然守 `user`/`assistant` 这个壳，把工具结果定义为"用户/环境提供给模型的输入"。

---

## 7. 参考资料

- [OpenAI · Migrate to the Responses API](https://developers.openai.com/api/docs/guides/migrate-to-responses) — items vs messages 的官方表述
- [OpenAI · Function calling guide](https://developers.openai.com/api/docs/guides/function-calling) — `function_call` / `function_call_output` 形态
- [OpenAI · Responses API reference](https://platform.openai.com/docs/api-reference/responses) — 各 item type 的精确 OpenAPI schema
- [Anthropic · Handle tool calls](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls) — `tool_use` / `tool_result` 形态 + tool_result 必须在最前的硬规则
