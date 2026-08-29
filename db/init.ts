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
          role TEXT NOT NULL DEFAULT 'user',
          created_at INTEGER NOT NULL,
          last_seen_at INTEGER NOT NULL
        )
      `),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS subscriptions (
          user_id TEXT PRIMARY KEY NOT NULL,
          provider TEXT,
          customer_id TEXT,
          subscription_id TEXT,
          status TEXT NOT NULL DEFAULT 'inactive',
          current_period_end INTEGER,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS ai_usage_counters (
          user_id TEXT NOT NULL,
          period TEXT NOT NULL,
          used INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (user_id, period),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
      db.prepare(`
        CREATE TABLE IF NOT EXISTS ai_request_events (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL,
          provider TEXT NOT NULL,
          model TEXT NOT NULL,
          status TEXT NOT NULL,
          error_code TEXT,
          latency_ms INTEGER NOT NULL,
          usage_units INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `),
      db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_ai_request_created
        ON ai_request_events(created_at)
      `),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS ai_model_controls (
          model TEXT PRIMARY KEY NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          updated_at INTEGER NOT NULL
        )
      `),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS admin_audit_events (
          id TEXT PRIMARY KEY NOT NULL,
          admin_user_id TEXT NOT NULL,
          action TEXT NOT NULL,
          target TEXT NOT NULL,
          details TEXT,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `),
    ]).then(() => undefined);
  }
  return initializationPromise;
}
