/**
 * Lesson 19 · DB Schema（Drizzle ORM + SQLite）
 * -----------------------------------------------------------
 * 两张表：
 *   conversations  —— 对话元数据
 *   items          —— 对话里的每一条 item（直接存 OpenAI ResponseItem 的 JSON）
 *
 * 设计原则：不自己发明 schema，直接把 OpenAI 原生格式存在 JSON 字段里。
 */

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// 对话表
export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(), // 本地生成的 UUID（不是 OpenAI 的 conv_xxx）
  title: text("title"), // 对话标题（可选）
  createdAt: integer("created_at").notNull(), // Unix 秒
});

// 对话内的 items
// item_json 存完整的 OpenAI ResponseItem（例如 { role: "user", content: "..." } 或 function_call 等）
export const items = sqliteTable("items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id),
  position: integer("position").notNull(), // 顺序（从 0 开始）
  itemJson: text("item_json").notNull(), // 序列化后的 OpenAI ResponseItem
  createdAt: integer("created_at").notNull(),
});
