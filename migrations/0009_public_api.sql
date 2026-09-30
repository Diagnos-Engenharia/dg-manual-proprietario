CREATE TABLE IF NOT EXISTS "organization_api_key" (
  "id" text PRIMARY KEY,
  "organizationId" text NOT NULL,
  "name" text NOT NULL,
  "keyPrefix" text NOT NULL,
  "keyHash" text NOT NULL,
  "scopes" jsonb NOT NULL DEFAULT '["manuals:read","developments:read"]'::jsonb,
  "createdBy" text NOT NULL,
  "lastUsedAt" timestamptz,
  "expiresAt" timestamptz,
  "revokedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "organization_api_key_hash_unique"
  ON "organization_api_key" ("keyHash");

CREATE INDEX IF NOT EXISTS "organization_api_key_org_active_idx"
  ON "organization_api_key" ("organizationId", "revokedAt");
