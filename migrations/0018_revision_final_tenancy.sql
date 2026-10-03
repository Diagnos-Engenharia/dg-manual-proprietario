-- /revisao-final: contexto tenant explícito e integridade multiempresa.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "activeOrganizationId" text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_active_organization_fk') THEN
    ALTER TABLE "user"
      ADD CONSTRAINT "user_active_organization_fk"
      FOREIGN KEY ("activeOrganizationId")
      REFERENCES "organization" ("id")
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "user_active_organization_idx"
  ON "user" ("activeOrganizationId");

-- Reconcile legacy duplicate memberships before enforcing uniqueness.
DO $$
DECLARE
  duplicate_row RECORD;
BEGIN
  FOR duplicate_row IN
    SELECT id, "organizationId", "userId", role, status, "lastAccessAt", canonical_id
    FROM (
      SELECT
        m.*,
        first_value(m.id) OVER (
          PARTITION BY m."organizationId", m."userId"
          ORDER BY m."createdAt", m.id
        ) AS canonical_id,
        row_number() OVER (
          PARTITION BY m."organizationId", m."userId"
          ORDER BY m."createdAt", m.id
        ) AS row_number
      FROM "member" m
    ) ranked
    WHERE row_number > 1
  LOOP
    UPDATE "member" canonical
    SET
      role = CASE
        WHEN canonical.role = 'owner' OR duplicate_row.role = 'owner' THEN 'owner'
        WHEN canonical.role = 'admin' OR duplicate_row.role = 'admin' THEN 'admin'
        WHEN canonical.role = 'admin_empreendimento' OR duplicate_row.role = 'admin_empreendimento' THEN 'admin_empreendimento'
        WHEN canonical.role = 'editor' OR duplicate_row.role = 'editor' THEN 'editor'
        WHEN canonical.role = 'validator' OR duplicate_row.role = 'validator' THEN 'validator'
        ELSE canonical.role
      END,
      status = CASE
        WHEN canonical.status = 'active' OR duplicate_row.status = 'active' THEN 'active'
        WHEN canonical.status = 'suspended' OR duplicate_row.status = 'suspended' THEN 'suspended'
        ELSE canonical.status
      END,
      "lastAccessAt" = CASE
        WHEN canonical."lastAccessAt" IS NULL THEN duplicate_row."lastAccessAt"
        WHEN duplicate_row."lastAccessAt" IS NULL THEN canonical."lastAccessAt"
        ELSE GREATEST(canonical."lastAccessAt", duplicate_row."lastAccessAt")
      END
    WHERE canonical.id = duplicate_row.canonical_id;

    DELETE FROM "development_assignment" duplicate_assignment
    USING "development_assignment" canonical_assignment
    WHERE duplicate_assignment."memberId" = duplicate_row.id
      AND canonical_assignment."memberId" = duplicate_row.canonical_id
      AND canonical_assignment."developmentId" = duplicate_assignment."developmentId";

    UPDATE "development_assignment"
    SET "memberId" = duplicate_row.canonical_id
    WHERE "memberId" = duplicate_row.id;

    DELETE FROM "member" WHERE id = duplicate_row.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "member_organization_user_unique"
  ON "member" ("organizationId","userId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'development_unit_development_tenant_fk') THEN
    ALTER TABLE "development_unit"
      ADD CONSTRAINT "development_unit_development_tenant_fk"
      FOREIGN KEY ("developmentId","organizationId")
      REFERENCES "development" ("id","organizationId")
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;
