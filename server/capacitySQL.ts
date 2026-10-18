export const capacitySchema = [
  `CREATE TABLE IF NOT EXISTS ai_request_leases (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, channel TEXT NOT NULL, expires_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_leases_expiry ON ai_request_leases(expires_at)`,
  `CREATE TABLE IF NOT EXISTS ai_rate_windows (subject TEXT NOT NULL, window INTEGER NOT NULL, used INTEGER NOT NULL, PRIMARY KEY(subject, window))`,
];

export const reserveWindowSQL = `
  INSERT INTO ai_rate_windows(subject, window, used) VALUES (?, ?, 1)
  ON CONFLICT(subject, window) DO UPDATE SET used = used + 1 WHERE used < ?
  RETURNING used`;

export const reserveLeaseSQL = `
  INSERT INTO ai_request_leases(id, user_id, channel, expires_at)
  SELECT ?, ?, ?, ?
  WHERE (SELECT COUNT(*) FROM ai_request_leases WHERE user_id = ? AND expires_at > ?) < ?
    AND (SELECT COUNT(*) FROM ai_request_leases WHERE channel = ? AND expires_at > ?) < ?
  RETURNING id`;

export function positiveLimit(value: string | undefined, fallback: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : fallback;
}
