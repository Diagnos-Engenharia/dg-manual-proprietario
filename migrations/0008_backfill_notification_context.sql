WITH matched AS (
  SELECT
    n.id AS notification_id,
    a."entityId" AS development_id,
    a.metadata ->> 'comment' AS rejection_reason,
    ROW_NUMBER() OVER (
      PARTITION BY n.id
      ORDER BY ABS(EXTRACT(EPOCH FROM (a."createdAt" - n."createdAt")))
    ) AS rn
  FROM "organization_notification" n
  JOIN "audit_log" a
    ON a."organizationId" = n."organizationId"
   AND (
        (n.type = 'validation_rejected' AND a.action = 'content.rejected')
     OR (n.type = 'validation_approved' AND a.action = 'content.approved')
     OR (n.type = 'validation_requested' AND a.action = 'content.sent_for_validation')
   )
   AND COALESCE(a.metadata ->> 'label', '') = split_part(n.body, ' · ', 1)
   AND ABS(EXTRACT(EPOCH FROM (a."createdAt" - n."createdAt"))) <= 300
  WHERE n."developmentId" IS NULL
)
UPDATE "organization_notification" n
SET
  "developmentId" = m.development_id,
  reason = CASE
    WHEN n.type = 'validation_rejected' THEN COALESCE(n.reason, m.rejection_reason)
    ELSE n.reason
  END
FROM matched m
WHERE n.id = m.notification_id
  AND m.rn = 1;
