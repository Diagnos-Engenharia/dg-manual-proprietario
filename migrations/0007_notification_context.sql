ALTER TABLE "organization_notification"
  ADD COLUMN IF NOT EXISTS "developmentId" text,
  ADD COLUMN IF NOT EXISTS "reason" text;
