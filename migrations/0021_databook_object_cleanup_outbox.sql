CREATE TABLE IF NOT EXISTS "databook_object_cleanup" (
  "pathname" text PRIMARY KEY,
  "developmentId" text NOT NULL,
  "requestedAt" timestamptz NOT NULL DEFAULT now(),
  "lastAttemptAt" timestamptz,
  "completedAt" timestamptz,
  "attempts" integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS "databook_object_cleanup_development_idx"
  ON "databook_object_cleanup" ("developmentId", "requestedAt");
