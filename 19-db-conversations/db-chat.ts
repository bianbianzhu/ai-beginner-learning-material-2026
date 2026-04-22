/**
 * Lesson 19 · DB-backed Conversations — 自建持久化对话
 * -----------------------------------------------------------
 * 目标：用 SQLite + Drizzle 保存对话历史，
 *       重启程序也不会丢失上下文。
 *
 * 2026 关键点：
 *   - 数据库 schema 和 OpenAI 原生格式一致（item_json 直接存 JSON）
 *   - 每轮：user 消息入库 → 拉历史 → 调 API → assistant 消息入库
 *   - 适合场景：需要审计日志、全量历史、自定义查询
 *
 * 运行：pnpm l19                              # 新对话
 *      pnpm l19 <conversationId>             # 继续已有对话
 *      pnpm l19 list                         # 列出所有对话
 */

import "dotenv/config";
import OpenAI from "openai";
import * as readline from "node:readline/promises";
import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import type { ResponseInputItem } from "openai/resources/responses/responses";
import { db, schema, DB_FILE } from "./db/index.js";

const client = new OpenAI();
const MODEL = "gpt-5.4-nano";

// ── DB 辅助函数 ──

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

function createConversation(title?: string): string {
  const id = randomUUID();
  db.insert(schema.conversations)
    .values({ id, title: title ?? null, createdAt: nowUnix() })
    .run();
  return id;
}

function loadHistory(conversationId: string): ResponseInputItem[] {
  const rows = db
    .select()
    .from(schema.items)
    .where(eq(schema.items.conversationId, conversationId))
    .orderBy(asc(schema.items.position))
    .all();
  return rows.map((r) => JSON.parse(r.itemJson) as ResponseInputItem);
}

function appendItem(conversationId: string, item: ResponseInputItem): void {
  // 查询当前 conversation 最大 position
  const lastRows = db
    .select()
    .from(schema.items)
    .where(eq(schema.items.conversationId, conversationId))
    .orderBy(asc(schema.items.position))
    .all();
  const nextPos = lastRows.length === 0 ? 0 : lastRows[lastRows.length - 1].position + 1;

  db.insert(schema.items)
    .values({
      conversationId,
      position: nextPos,
      itemJson: JSON.stringify(item),
      createdAt: nowUnix(),
    })
    .run();
}

function listConversations() {
  const rows = db.select().from(schema.conversations).all();
  if (rows.length === 0) {
    console.log("  (暂无对话)");
    return;
  }
  for (const row of rows) {
    const itemCount = db
      .select()
      .from(schema.items)
      .where(eq(schema.items.conversationId, row.id))
      .all().length;
    const createdAt = new Date(row.createdAt * 1000).toISOString();
    console.log(
      `  ${row.id}  | items=${itemCount} | ${createdAt} | ${row.title ?? "(untitled)"}`
    );
  }
}

// ── 主程序 ──

async function main() {
  console.log("=== Lesson 19 · DB-backed Chat ===");
  console.log(`  DB file: ${DB_FILE}\n`);

  const arg = process.argv[2];

  // list 模式：列出所有对话
  if (arg === "list") {
    console.log("已有对话列表：");
    listConversations();
    return;
  }

  // 决定 conversationId：沿用已有 or 新建
  let conversationId: string;
  if (arg) {
    // 校验是否存在
    const exists = db
      .select()
      .from(schema.conversations)
      .where(eq(schema.conversations.id, arg))
      .all();
    if (exists.length === 0) {
      console.log(`未找到对话 ${arg}，创建新对话...`);
      conversationId = createConversation();
    } else {
      conversationId = arg;
      console.log(`继续对话 ${conversationId}`);
    }
  } else {
    conversationId = createConversation();
    console.log(`新建对话 ${conversationId}`);
  }

  // 加载历史
  const initialHistory = loadHistory(conversationId);
  console.log(`  已加载 ${initialHistory.length} 条历史 items\n`);

  // 回放历史（让用户看到之前聊了什么）
  if (initialHistory.length > 0) {
    console.log("--- 历史回放 ---");
    for (const item of initialHistory) {
      if (
        "role" in item &&
        item.role &&
        "content" in item &&
        typeof item.content === "string"
      ) {
        const who = item.role === "user" ? "You" : "AI ";
        console.log(`${who}: ${item.content}`);
      }
    }
    console.log("-----------------\n");
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("输入消息开始聊天，输入 /exit 退出\n");

  // 读到 EOF（Ctrl-D 或 stdin pipe 结束）时设 closed，让主循环自然退出
  let closed = false;
  rl.once("close", () => {
    closed = true;
  });

  while (!closed) {
    let userInput: string;
    try {
      userInput = await rl.question("You: ");
    } catch {
      break; // readline 已关闭
    }

    if (userInput.trim() === "/exit") {
      console.log(`\nBye! 对话已保存，下次继续用：pnpm l19 ${conversationId}`);
      rl.close();
      break;
    }
    if (!userInput.trim()) continue;

    // 1. 保存用户消息到 DB
    const userItem: ResponseInputItem = { role: "user", content: userInput };
    appendItem(conversationId, userItem);

    // 2. 从 DB 拉全部历史（包括刚存进去的）
    const history = loadHistory(conversationId);

    // 3. 调用 API
    const response = await client.responses.create({
      model: MODEL,
      input: history,
    });

    // 4. 保存 assistant 回复到 DB
    // 注意：我们存 role+content 最简格式，让下一轮也能用
    const assistantItem: ResponseInputItem = {
      role: "assistant",
      content: response.output_text,
    };
    appendItem(conversationId, assistantItem);

    console.log(`AI : ${response.output_text}`);
    console.log(`  [input_tokens: ${response.usage?.input_tokens}]\n`);
  }
}

main().catch((err) => {
  console.error("Something went wrong:", err);
  process.exit(1);
});
