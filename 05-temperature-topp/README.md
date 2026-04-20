# Lesson 5 · temperature 与 top_p（概念课，无代码）

> 这一节**没有代码**。你只需要读完，然后记住一句话：**产品用低温，创意用高温，两者别同时调。**

---

## 1. AI 是怎么"选"下一个词的？

想象 AI 每生成一个词，都是在**一袋概率不同的候选词**里抓一个：

```
用户："今天天气真" → 模型内部算出候选：
  "好"     → 概率 0.60
  "不错"    → 概率 0.20
  "糟糕"    → 概率 0.10
  "奇怪"    → 概率 0.06
  ... 更多低概率词
```

默认情况下它**更可能抓"好"**，但不是 100%。这就是**采样（sampling）**。
`temperature` 和 `top_p` 就是两个控制"抓得多刻板还是多狂野"的旋钮。

---

## 2. `temperature`（温度）

把概率分布**拉平或收紧**。

```
temperature = 0.0   →  "永远抓概率最高那个" → 非常死板、几乎可复现
temperature = 0.3   →  大多数情况抓最可能的 → 产品级稳定
temperature = 1.0   →  SDK 默认值          → 有创造性但可控
temperature = 1.5+  →  分布被拉平          → 可能出现罕见、跳跃、甚至胡言乱语的词
```

**比喻**：`temperature` 就像给掷骰子之前**加热或冷冻**。
- 冷（低温）→ 骰子总是朝最重的一面落下（=最常见的词）
- 热（高温）→ 骰子像被打了一样到处乱蹦

---

## 3. `top_p`（nucleus sampling / 核采样）

**只从"累计概率前 p"的候选里抽**，其余一律扔掉。

```
top_p = 1.0   →  所有候选都能被抽中（不做截断）
top_p = 0.9   →  只保留累计概率 90% 的头部候选 → 常见、合理
top_p = 0.5   →  只保留累计概率 50% 的头部候选 → 很保守
```

**比喻**：`top_p` 是**把一袋糖果按重量从大到小排好，只从前 p% 里抓**。
扔掉了"罕见糖果"，所以不会出现古怪输出。

---

## 4. 它们有什么区别？

| | `temperature` | `top_p` |
|---|---|---|
| 机制 | 改变**每个词的概率** | 改变**候选池的大小** |
| 极端值 0/1 | 0=决定性，1=默认 | 1=不截断 |
| 常用值 | 0.2 ~ 0.8 | 0.9 ~ 1.0 |

**官方建议：二选一调，不要同时调。** 两个一起动很容易让效果变得不可预测。

---

## 5. 怎么选？（**记这张表**）

| 场景 | 推荐 |
|---|---|
| 产品 API（summarize / extract / 分类） | `temperature: 0.2 ~ 0.4`，`top_p` 默认 |
| 对话助手（chatbot） | `temperature: 0.5 ~ 0.8` |
| 创意写作 / 头脑风暴 | `temperature: 0.9 ~ 1.2` |
| 要 JSON / Structured Output | 直接用 **Structured Outputs（Lesson 6）**，比调温更可靠 |
| 要代码 / 数学 | 用**推理模型 + 低温**，而不是调高 `top_p` |

---

## 6. 一个直觉练习

同样的 prompt `"Write one sentence about the sea."`：

```
temperature=0.0  →  "The sea is a vast body of salt water covering most of Earth."
                    （每次都几乎一样）

temperature=0.7  →  "The sea whispered secrets to the shore as the tide rolled in."
                    （有诗意但仍合理）

temperature=1.5  →  "The sea, an oyster of liquid moonlight, hums backwards to the wind."
                    （很美也可能很怪，甚至不通顺）
```

---

## 7. 为什么 Lesson 6（Structured Output）更重要

你可能会问："那我把 `temperature` 调到 0，AI 是不是就能稳定输出 JSON 了？"

**不能完全。** 低温只是"更可能"输出你想要的，不是"保证"。
2026 的正确做法是：**Structured Outputs** —— 用 JSON Schema / zod 强约束输出格式，
连一个字段都不会缺。下一节课就学它。

---

## ✅ 记住一句话

> **产品输出用低 `temperature`（0.2~0.4）；创意输出用高 `temperature`（0.8~1.2）。
> 想要 100% 可控结构 → 去学 Structured Outputs。**
