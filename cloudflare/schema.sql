-- Feedback box (functions/api/feedback.js). Apply: npx wrangler d1 execute hotscrap-feedback --remote --file schema.sql
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,          -- ISO time, UTC
  kind TEXT NOT NULL,                -- bug / idea / etc
  message TEXT NOT NULL,
  contact TEXT,                      -- optional, what the sender typed
  page TEXT,                         -- path the box was opened on
  ua TEXT,
  ip_hash TEXT NOT NULL              -- salted hash, only for the rate limit
);
CREATE INDEX IF NOT EXISTS feedback_ip_time ON feedback (ip_hash, created_at);
