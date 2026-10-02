CREATE TABLE IF NOT EXISTS "rateLimit" (
  "id" text PRIMARY KEY,
  "key" text NOT NULL UNIQUE,
  "count" integer NOT NULL DEFAULT 0,
  "lastRequest" bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS "rate_limit_last_request_idx" ON "rateLimit" ("lastRequest");
