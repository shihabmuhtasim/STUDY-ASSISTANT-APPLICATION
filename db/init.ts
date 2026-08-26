import { env } from 'cloudflare:workers';

let initializationPromise: Promise<void> | null = null;

export function ensureDatabaseSchema(): Promise<void> {
  if (!initializationPromise) {
    const db = env.DB;
    initializationPromise = db.batch([
      db.prepare(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY NOT NULL,
          email TEXT NOT NULL,
          display_name TEXT NOT NULL,
          plan TEXT NOT NULL DEFAULT 'free',
          created_at INTEGER NOT NULL,
          last_seen_at INTEGER NOT NULL
        )
      `),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS ai_usage_events (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL,
          provider TEXT NOT NULL,
          model TEXT NOT NULL,
          request_type TEXT NOT NULL,
          input_characters INTEGER NOT NULL,
          output_characters INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `),
      db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_ai_usage_user_created
        ON ai_usage_events(user_id, created_at)
      `),
    ]).then(() => undefined);
  }
  return initializationPromise;
}
