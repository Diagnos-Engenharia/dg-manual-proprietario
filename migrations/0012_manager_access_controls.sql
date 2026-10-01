ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "accessStatus" text NOT NULL DEFAULT 'active';

UPDATE "user"
SET "accessStatus" = 'active'
WHERE "accessStatus" IS NULL OR "accessStatus" NOT IN ('active','disabled');
