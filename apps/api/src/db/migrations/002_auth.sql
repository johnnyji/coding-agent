-- Auth.js (next-auth v5) required tables for @auth/pg-adapter
-- https://authjs.dev/getting-started/adapters/pg
--
-- IMPORTANT: The mixed casing here is intentional and must not be changed.
-- Columns in double quotes ("userId", "emailVerified", "sessionToken",
-- "providerAccountId") are camelCase because @auth/pg-adapter's internal
-- queries reference them with quoted identifiers — Postgres preserves case
-- for quoted names, so renaming them to snake_case will break the adapter.
-- The snake_case columns (access_token, refresh_token, etc.) are referenced
-- without quotes by the adapter, so Postgres treats them case-insensitively.

CREATE TABLE IF NOT EXISTS verification_token (
  identifier TEXT NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  token TEXT NOT NULL,
  PRIMARY KEY (identifier, token)
);

CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  type VARCHAR(255) NOT NULL,
  provider VARCHAR(255) NOT NULL,
  "providerAccountId" VARCHAR(255) NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at BIGINT,
  id_token TEXT,
  scope TEXT,
  session_state TEXT,
  token_type TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  "sessionToken" VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  email VARCHAR(255),
  "emailVerified" TIMESTAMPTZ,
  image TEXT
);
