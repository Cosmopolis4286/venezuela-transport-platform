-- One line for independent drivers per vehicle type (ADR-039). If a database already has several
-- (only possible in development, before this rule), the oldest stays the platform's and the others
-- become ordinary lines, keeping their members, vehicles and history.
UPDATE "organizations" AS o SET "operated_by_platform" = false
WHERE o."operated_by_platform" AND EXISTS (
  SELECT 1 FROM "organizations" AS p
  WHERE p."operated_by_platform" AND p."type" = o."type"
    AND (p."created_at", p."id") < (o."created_at", o."id")
);--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_platform_line_key" ON "organizations" USING btree ("type") WHERE "organizations"."operated_by_platform";
