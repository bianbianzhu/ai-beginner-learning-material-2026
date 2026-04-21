import "dotenv/config";
import OpenAI from "openai";

const client = new OpenAI(); // 自动读取 process.env.OPENAI_API_KEY

async function main() {
  const response = await client.responses.create({
    model: "gpt-5.4-nano",
    input: "中国有句古话叫做 说曹操到，曹操到。那么曹操到底到没到？",
    temperature: 1,
    reasoning: {
      effort: "low",
      summary: "detailed",
    },
  });

  const reasoningSummary = response.output.find((o) => o.type === "reasoning");

  // output_text 是 SDK 的便捷字段 —— 把所有文本 output 拼成一个字符串
  console.log("Reasoning summary:", reasoningSummary);
}

main().catch((err) => {
  console.error("Something went wrong:", err);
  process.exit(1);
});

// ERROR - 5.4
// GPT-5.4 的 reasoning.effort 默认是 none(继承 5.2 的默认值)。这意味着:

// 如果你调 GPT-5.4 但没传 reasoning.effort,你其实是在跑 non-reasoning 模式,temperature 是可以用的
// 一旦你设了 effort=low/medium/high/xhigh,temperature 就必须去掉

// 设置了 reasoning.effort 但temperature 不是1（或者干脆不要给） 就报错 - 所以其实temp default就是1
// Something went wrong: BadRequestError: 400 Unsupported parameter: 'temperature' is not supported with this model.

// ERROR - 其他reasoning model
// 没reasoning.effort 但是默认是开启的， 所以temperature只要不是1，或者没给，就报错
// const response = await client.responses.create({
//     model: "gpt-5-nano",
//     input: "洗车店离我50米，我要去洗车，我开过去还是走过去？",
//     temperature: 0.5,
//   });
// Something went wrong: BadRequestError: 400 Unsupported parameter: 'temperature' is not supported with this model.

// 有很多模型你还没办法关reasoning - 尼玛
// const response = await client.responses.create({
//     model: "gpt-5-nano",
//     input: "洗车店离我50米，我要去洗车，我开过去还是走过去？",
//     temperature: 0.5,
//     reasoning: {
//       effort: "none",
//     },
//   });
// Something went wrong: BadRequestError: 400 Unsupported value: 'none' is not supported with the 'gpt-5-nano' model. Supported values are: 'minimal', 'low', 'medium', and 'high'.
