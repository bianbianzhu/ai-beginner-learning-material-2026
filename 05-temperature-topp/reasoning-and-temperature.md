# Reasoning 模型 Temperature 参数研究报告

> 对比对象:GPT-5.4 / Claude Opus 4.6 / Claude Haiku 4.5 / Gemini 3 Flash / Gemini 3 Pro
> 更新日期:2026-04-21

---

## 一、TL;DR 一句话总结

**三家厂商对 reasoning 模型的 temperature 策略已经分道扬镳,而且都在往"别动 temperature"的方向收紧。** OpenAI 是硬拒(reasoning 开启时传 temperature 直接 400);Anthropic Opus 4.6 / Haiku 4.5 仍允许传,但 extended thinking 必须 `temperature=1`(Opus 4.7 已经完全禁止);Google Gemini 3 是"技术上允许、官方强烈劝退",传 `< 1.0` 会出现 looping 和性能退化。

> ⚠️ 需要更正一点:**GPT-5.4 已经发布(2026-03-05),但你说的"Gemini 3.1 Pro"目前还不存在**(纯幻觉，劳资用老久了）。Google 3 系列目前有 Gemini 3 Pro、Gemini 3 Flash、Gemini 3.1 Flash-Lite、Nano Banana Pro (3 Pro Image) 和 Nano Banana 2 (3.1 Flash Image),没有 3.1 Pro。下面 Gemini 部分按 **Gemini 3 Pro** 来讲。

---

## 二、按厂商详细分析

### 1. OpenAI GPT-5.4(及 GPT-5 全系列 reasoning 模型)

**结论:Reasoning 开启时,temperature 不可用。传了就 400。**

#### 具体行为

| 场景                                                            | temperature 是否可设                                                                                       |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `reasoning.effort` ≠ `none`(即真正在做 reasoning)               | ❌ **不支持**,传 `temperature` 或 `top_p` 报 `Unsupported parameter` 400， 传 temperature = 1 是不会报错的 |
| `reasoning.effort = "none"`(GPT-5.2+ 支持的 non-reasoning 模式) | ✅ 支持 temperature(这是 GPT-5.2+ 默认模式)                                                                |
| `gpt-5-chat-latest`(非 reasoning 变体)                          | ✅ 支持                                                                                                    |

具体报错长这样:

```
Error code: 400 - "Unsupported value: 'temperature' does not support 0.2 with this model.
Only the default (1) value is supported."
```

#### 为什么 OpenAI 要禁

Hippocampus's Garden 的分析给了最合理的解释:现代 reasoning 模型(GPT-5、o3、o4-mini)内部不是一次 softmax 采样,而是 **多轮 generation + verification + selection** 的 pipeline。如果你从外面强行 `temperature=0`,所有内部推理路径会坍缩到同一条 greedy path,多路径推理的意义就没了。OpenAI 为了保证 reasoning 质量和安全校准,干脆把这个旋钮焊死。

替代方式:用 `reasoning.effort` (`none` / `low` / `medium` / `high` / `xhigh`) 和 `verbosity` 来控制输出,不用 temperature。

#### GPT-5.4 特有情况

GPT-5.4 的 `reasoning.effort` 默认是 `none`(继承 5.2 的默认值)。这意味着:

- 如果你调 GPT-5.4 但没传 `reasoning.effort`,你其实是在跑 non-reasoning 模式,**temperature 是可以用的**
- 一旦你设了 `effort=low/medium/high/xhigh`,temperature 就必须去掉

这也是 LangChain 最近出 bug 的地方 —— `validate_temperature` 在 5.2+ 默认 `effort=none` 的场景下错误地把 temperature 剔除了(GitHub issue #35423)。所以**用 LangChain 调 GPT-5.x 要盯住 SDK 版本**。

---

### 2. Anthropic Claude Opus 4.6 / Haiku 4.5

**结论:temperature 参数"能传",但有两个硬规则。**

#### 硬规则 1:`temperature` 和 `top_p` 不能同时传

这是从 Opus 4.1(2025 年 8 月)开始的 breaking change,贯穿整个 Claude 4.x 系列(Opus 4.6、Sonnet 4.6、Haiku 4.5 都一样):

```json
{
  "error": {
    "code": "invalid_request_error",
    "message": "temperature and top_p cannot both be specified for this model. Please use only one."
  }
}
```

官方建议用 temperature 一个就够了。很多框架(LangChain 老版本、n8n、LiteLLM、QualCoder 等)默认同时传,升 4.x 时都踩过这个坑。

#### 硬规则 2:开启 extended thinking 时 `temperature` 必须为 1

官方 API 文档原话:

> On models before Claude Opus 4.7, temperature must be set to 1 when extended thinking is enabled.

也就是说:

- **不开 thinking**:Opus 4.6 / Haiku 4.5 可以传任意 `[0, 1]` 的 temperature
- **开 extended thinking 或 adaptive thinking**:temperature 必须 = 1(不传等于 1,也 OK)

Haiku 4.5 尤其要小心:社区评估指出 **Haiku 4.5 在高 temperature 下质量下降更明显**,建议 ≤ 0.7。

#### Opus 4.6 vs Opus 4.7 的关键差异(预告)

虽然你没问 4.7,但既然我现在在 4.7 上跑,顺便标一下分水岭 —— 因为这直接影响你未来迁移策略:

|                                        | Opus 4.6                          | Opus 4.7                             |
| -------------------------------------- | --------------------------------- | ------------------------------------ |
| 传 `temperature` ≠ 默认值              | ✅ 允许(但 thinking on 时必须 =1) | ❌ **直接 400**                      |
| 传 `top_p` / `top_k` ≠ 默认值          | ✅ 允许                           | ❌ **直接 400**                      |
| extended thinking with `budget_tokens` | ✅ 支持(但 deprecated)            | ❌ 不再接受,只支持 adaptive thinking |

**所以 Anthropic 的方向非常明确:4.7 已经彻底删除了采样参数接口,你现在在 4.6 / Haiku 4.5 上依赖 temperature 的代码,迁到 4.7 一定会 break。**

Promptfoo 这样的 eval 框架已经在 Opus 4.7 路径上主动 suppress temperature,传了只会 log 一条警告。

---

### 3. Google Gemini 3 Pro / Gemini 3 Flash

**结论:技术上仍然支持 temperature,但官方和主流 SDK 都"强烈建议别动"。**

#### 官方立场

Google Developers Blog(Gemini 3 发布公告)原话就一句:

> We strongly recommend keeping the temperature parameter at its default value of 1.0.

AI Studio 官方开发者指南说得更直白:

> Changing the temperature (setting it below 1.0) may lead to unexpected behavior, such as looping or degraded performance, particularly in complex mathematical or reasoning tasks.

翻成人话:**Gemini 3 内部的 reasoning 机制是围绕 `T=1.0` 校准的,调低它会出现"思考卡死循环"或者推理质量下降,尤其在数学和复杂推理题上。**

#### LiteLLM 的 wrapper 行为

LiteLLM 对 Gemini 3 的做法特别典型:

- 默认把 temperature 设成 1.0
- 强烈建议保持默认
- `reasoning_effort="none"` 会被自动映射到 `thinking_level="low"`(**注意:Gemini 3 不能完全关闭 thinking**,即使你明确设 none)

#### 和前面两家的本质区别

Gemini 3 没有在 API 层面硬拒 temperature(你真的传 `0.2` 也能发送出去),但它用的是 **"软约束" + 性能惩罚**策略。这对调试特别不友好 —— 没有明确的 400 error 提示你参数错了,表现就是模型莫名其妙一直在重复输出或者推理变差,你还得自己定位是不是 temperature 设错了。

从工程角度,我个人会把 Gemini 3 的 temperature 当"也别传"来对待。

---

## 三、汇总对比表

| 模型                                               | Reasoning 模式             | temperature 行为 | temperature=0 | 推荐做法                                             |
| -------------------------------------------------- | -------------------------- | ---------------- | ------------- | ---------------------------------------------------- |
| **GPT-5.4** (`effort=none`)                        | 不推理                     | ✅ 支持          | ✅ 可以       | 和 GPT-4.1 用法一样                                  |
| **GPT-5.4** (`effort=low/med/high/xhigh`)          | 推理中                     | ❌ 传了 400      | ❌ 不允许     | 删掉 temperature,用 `reasoning.effort` + `verbosity` |
| **Claude Opus 4.6** (不开 thinking)                | 不推理                     | ✅ 支持 `[0,1]`  | ✅ 可以       | 和 `top_p` 二选一                                    |
| **Claude Opus 4.6** (adaptive / extended thinking) | 推理中                     | ⚠️ **必须 =1**   | ❌ 不允许     | 不传就好(默认 1)                                     |
| **Claude Haiku 4.5** (不开 thinking)               | 不推理                     | ✅ 支持          | ✅ 可以       | 建议 ≤ 0.7,高温质量会掉                              |
| **Claude Haiku 4.5** (extended thinking)           | 推理中                     | ⚠️ **必须 =1**   | ❌ 不允许     | 不传                                                 |
| **Gemini 3 Flash**                                 | 默认 reasoning(不能完全关) | ✅ 技术上支持    | ⚠️ "软禁用"   | 保持默认 1.0,否则可能循环                            |
| **Gemini 3 Pro**                                   | 默认 reasoning(不能完全关) | ✅ 技术上支持    | ⚠️ "软禁用"   | 保持默认 1.0                                         |

---

## 四、Best Practices(工程实战)

### 1. 写统一客户端代码时的防御模式

对 Tianyi 你在 LangGraph / 多 agent 架构里特别有用 —— 因为你可能在同一个 pipeline 里调用不同厂商的模型。建议把 temperature 处理抽成一层:

```python
def build_params(model_id: str, base_params: dict) -> dict:
    params = base_params.copy()

    # OpenAI reasoning 模型:effort != none 时必须删
    if model_id.startswith("gpt-5") and "chat" not in model_id:
        effort = params.get("reasoning", {}).get("effort", "none")
        if effort != "none":
            params.pop("temperature", None)
            params.pop("top_p", None)

    # Anthropic:temperature / top_p 二选一;Opus 4.7+ 全删
    elif "claude" in model_id:
        if "opus-4-7" in model_id or "mythos" in model_id:
            params.pop("temperature", None)
            params.pop("top_p", None)
            params.pop("top_k", None)
        else:
            # 4.x:只保留 temperature
            if "temperature" in params and "top_p" in params:
                params.pop("top_p")
            # 开 thinking 时强制 temperature=1
            if params.get("thinking", {}).get("type") in ("enabled", "adaptive"):
                params["temperature"] = 1.0

    # Gemini 3:强烈建议保持默认
    elif "gemini-3" in model_id:
        params["temperature"] = 1.0  # 或直接不传

    return params
```

### 2. 别再依赖 `temperature=0` 求"确定性"

这是个老习惯但现在已经不靠谱了:

- **temperature=0 从来就不保证完全确定** —— 同样的输入同样的 seed,由于 batching、GPU 非确定性 kernel、MoE 路由等原因,输出仍可能有差异
- 三家 reasoning 模型现在都明确拒绝或劝退 `temperature=0`,说明他们内部本来就是多路径采样 + 选择,外部的确定性假设从一开始就不成立
- 如果你要的是 **reproducibility**(复现性),正确做法是:
  - 用 `seed` 参数(OpenAI 的 chat completions API 提供,Gemini beta 也有)
  - 在 eval 框架里做 N 次采样 + 统计聚合,而不是追求单次确定
  - 对确定性要求极高的场景(比如金融、医疗),切换到非 reasoning 模型(Haiku 4.5 不开 thinking、gpt-5-chat-latest、Gemini 2.5 Flash with thinking off)

### 3. 从旧代码迁移到 reasoning 模型时的 checklist

- [ ] 把 `temperature=0.2 / 0 / 0.7` 这些老习惯值的地方先标注出来
- [ ] 在 OpenAI 侧:判断是否真的需要 reasoning,若需要则删掉 temperature
- [ ] 在 Anthropic 侧:检查是否同时传了 `top_p`,确认 thinking 配置下 temperature=1
- [ ] 在 Gemini 侧:全部删掉,保留默认
- [ ] 升级 SDK(langchain-openai ≥ 1.1.x、langchain-anthropic ≥ 0.3、litellm 最新版都已经处理了这些 quirk,但彼此行为不完全一致)
- [ ] 在 eval pipeline 里加一个 model compatibility 测试:对每个目标模型跑一次最小 request,验证参数不被拒

### 4. 用什么替代 temperature 调控输出?

既然 temperature 这个旋钮被拿走了,新的控制面板是:

| 目标                | OpenAI                            | Anthropic                      | Gemini              |
| ------------------- | --------------------------------- | ------------------------------ | ------------------- |
| 控制推理深度        | `reasoning.effort`                | `effort` + `adaptive thinking` | `thinking_level`    |
| 控制输出长度        | `verbosity` + `max_output_tokens` | `max_tokens`                   | `max_output_tokens` |
| 控制输出风格/创造性 | 只能通过 prompt                   | 只能通过 prompt                | 只能通过 prompt     |
| 做结构化输出        | `response_format` / JSON schema   | `output_config.format`         | `response_schema`   |

**核心变化:"通过数值旋钮调模型行为"的时代基本结束了,现在主要通过 prompt engineering + effort/thinking level 来控制。** 这个转变对你做 agent 系统影响很大 —— 以前写 prompt 可以松一点靠低 temperature 锁定输出,现在得靠 prompt 自己把约束写清楚。

---

## 五、底层原因延伸思考

三家的做法乍看不同,但逻辑其实一致:**现代 reasoning 模型在内部已经跑了一个"多样化采样 + 选择"的元算法,外部 temperature 是对这个元算法的干扰。** 区别只是:

- OpenAI:硬拒,最干脆
- Anthropic:在 4.6/4.5 上保留过渡期(可传但有限制),4.7 跟上 OpenAI
- Google:软约束 + 官方劝退,最温和但最容易踩坑

你可以把这看成一个更大趋势的信号:LLM API 正在从 "sampling primitives"(底层采样旋钮)抽象到 "reasoning primitives"(推理深度、输出形式、工具调用策略)。对我们这种做 production agent 的人,这是好事 —— 少了一个魔法数字可以调,多了几个语义明确的 knob。

---

## 参考资料

- OpenAI API docs: Using GPT-5.4 / Reasoning models
- Anthropic API docs: Adaptive thinking / Migration guide / What's new in Claude Opus 4.7
- Google Developers Blog: New Gemini API updates for Gemini 3
- Hippocampus's Garden: Why You Can't Set Temperature on GPT-5/o3
- LiteLLM: DAY 0 Support: Gemini 3
- LangChain Issue #35423(GPT-5.2 temperature dropped 问题)
- QualCoder Issue #1125(Claude 4.x top_p / temperature 冲突)
