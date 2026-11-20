INSERT INTO "Workspace" ("id", "name", "createdAt", "updatedAt")
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'TicketIQ Demo Workspace',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;

UPDATE "Ticket"
SET "workspaceId" = '00000000-0000-4000-8000-000000000001'
WHERE "workspaceId" IS NULL;

UPDATE "Agent"
SET "workspaceId" = '00000000-0000-4000-8000-000000000001'
WHERE "workspaceId" IS NULL;

UPDATE "TicketNote" AS note
SET "workspaceId" = ticket."workspaceId"
FROM "Ticket" AS ticket
WHERE note."ticketId" = ticket."id"
  AND note."workspaceId" IS NULL;

UPDATE "TicketActivity" AS activity
SET "workspaceId" = ticket."workspaceId"
FROM "Ticket" AS ticket
WHERE activity."ticketId" = ticket."id"
  AND activity."workspaceId" IS NULL;

ALTER TABLE "Ticket"
ALTER COLUMN "workspaceId" SET NOT NULL;

ALTER TABLE "Agent"
ALTER COLUMN "workspaceId" SET NOT NULL;

ALTER TABLE "TicketNote"
ALTER COLUMN "workspaceId" SET NOT NULL;

ALTER TABLE "TicketActivity"
ALTER COLUMN "workspaceId" SET NOT NULL;

ALTER TABLE "Agent"
ADD COLUMN "userId" TEXT;

CREATE UNIQUE INDEX "Agent_userId_key" ON "Agent"("userId");

ALTER TABLE "Agent"
ADD CONSTRAINT "Agent_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
