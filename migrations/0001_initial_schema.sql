-- Initial schema for Better Auth + DG Manual do Proprietario
-- Safe to run on a new database. Later migrations (0002+) extend this schema.

CREATE TABLE IF NOT EXISTS "user" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  "image" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "session" (
  "id" text PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  "token" text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "account" (
  "id" text PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope" text,
  "password" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id" text PRIMARY KEY,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "organization" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "logo" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "metadata" text
);

CREATE TABLE IF NOT EXISTS "member" (
  "id" text PRIMARY KEY,
  "organizationId" text NOT NULL,
  "userId" text NOT NULL,
  "role" text NOT NULL DEFAULT 'member',
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "development" (
  "id" text PRIMARY KEY,
  "userId" text NOT NULL,
  "organizationId" text,
  "name" text NOT NULL,
  "client" text NOT NULL,
  "status" text NOT NULL DEFAULT 'em_andamento',
  "deliveryDate" text NOT NULL,
  "masterProgress" integer NOT NULL DEFAULT 0,
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "databook_file" (
  "id" text PRIMARY KEY,
  "userId" text NOT NULL,
  "developmentId" text NOT NULL,
  "folder" text NOT NULL,
  "name" text NOT NULL,
  "pathname" text NOT NULL UNIQUE,
  "contentType" text,
  "sizeBytes" integer NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "session_user_idx" ON "session" ("userId");
CREATE INDEX IF NOT EXISTS "account_user_idx" ON "account" ("userId");
CREATE INDEX IF NOT EXISTS "member_user_idx" ON "member" ("userId");
CREATE INDEX IF NOT EXISTS "member_org_idx" ON "member" ("organizationId");
CREATE INDEX IF NOT EXISTS "development_user_idx" ON "development" ("userId");
CREATE INDEX IF NOT EXISTS "development_org_idx" ON "development" ("organizationId");
CREATE INDEX IF NOT EXISTS "databook_development_idx" ON "databook_file" ("developmentId");
