-- =====================================================================
-- Migration 004: personal accounts (username + password) replace the shared role PINs
-- Run ONCE in the Neon SQL Editor of the database the app uses. Safe to run again.
-- Creates the table and one admin account: username  admin  (change the password in Settings after your first login).
-- =====================================================================
CREATE TABLE IF NOT EXISTS users (
  id             BIGSERIAL PRIMARY KEY,
  username       TEXT NOT NULL CHECK (username ~ '^[a-z0-9][a-z0-9._-]{1,29}$'),
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL,           -- admin, designer, editor, or the key of a custom role
  version        INTEGER NOT NULL DEFAULT 1,  -- bumped when the password changes; logs the user out everywhere
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_idx ON users (lower(username));

INSERT INTO users (username, password_hash, role)
SELECT 'admin', '$2b$10$AUlKab9wxCy.9Zft8xkUmeeyzLIun4ur3U465GILDbWss3.NwzZjm', 'admin'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE lower(username) = 'admin');
