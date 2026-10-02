CREATE UNIQUE INDEX IF NOT EXISTS "member_id_org_unique"
  ON "member" ("id","organizationId");

CREATE UNIQUE INDEX IF NOT EXISTS "development_id_org_unique"
  ON "development" ("id","organizationId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignment_member_tenant_fk') THEN
    ALTER TABLE "development_assignment"
      ADD CONSTRAINT "assignment_member_tenant_fk"
      FOREIGN KEY ("memberId","organizationId")
      REFERENCES "member" ("id","organizationId") NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignment_development_tenant_fk') THEN
    ALTER TABLE "development_assignment"
      ADD CONSTRAINT "assignment_development_tenant_fk"
      FOREIGN KEY ("developmentId","organizationId")
      REFERENCES "development" ("id","organizationId") NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'manual_version_development_tenant_fk') THEN
    ALTER TABLE "manual_version"
      ADD CONSTRAINT "manual_version_development_tenant_fk"
      FOREIGN KEY ("developmentId","organizationId")
      REFERENCES "development" ("id","organizationId") NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'finishing_table_development_tenant_fk') THEN
    ALTER TABLE "finishing_table"
      ADD CONSTRAINT "finishing_table_development_tenant_fk"
      FOREIGN KEY ("developmentId","organizationId")
      REFERENCES "development" ("id","organizationId") NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'finishing_history_development_tenant_fk') THEN
    ALTER TABLE "finishing_table_history"
      ADD CONSTRAINT "finishing_history_development_tenant_fk"
      FOREIGN KEY ("developmentId","organizationId")
      REFERENCES "development" ("id","organizationId") NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'memorial_import_development_tenant_fk') THEN
    ALTER TABLE "memorial_import"
      ADD CONSTRAINT "memorial_import_development_tenant_fk"
      FOREIGN KEY ("developmentId","organizationId")
      REFERENCES "development" ("id","organizationId") NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'content_validation_development_tenant_fk') THEN
    ALTER TABLE "development_content_validation"
      ADD CONSTRAINT "content_validation_development_tenant_fk"
      FOREIGN KEY ("developmentId","organizationId")
      REFERENCES "development" ("id","organizationId") NOT VALID;
  END IF;
END $$;
