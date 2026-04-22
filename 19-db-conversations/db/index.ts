/**
 * Lesson 19 · DB 连接 + 首次建表
 * -----------------------------------------------------------
 * 用 better-sqlite3 打开本地文件 → drizzle 包装 → 首次运行自动建表
 * （教学简化版：用 "IF NOT EXISTS" 建表，不维护 migration 文件）
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "../chat.db"); // SQLite 文件

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL"); // 推荐配置

// 首次运行时自动建表（production 里应该用 drizzle-kit 的 migration）
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    position INTEGER NOT NULL,
    item_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_items_conv_pos ON items(conversation_id, position);
`);

export const db = drizzle(sqlite, { schema });
export { schema };
export const DB_FILE = DB_PATH;
