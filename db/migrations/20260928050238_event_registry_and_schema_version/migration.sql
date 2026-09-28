-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "quarantined" BOOLEAN NOT NULL DEFAULT false,
    "timestamp" DATETIME NOT NULL,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "app" TEXT NOT NULL,
    "release" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "featureFlag" TEXT,
    "variant" TEXT,
    "action" TEXT NOT NULL,
    "value" REAL,
    "context" TEXT NOT NULL DEFAULT '{}'
);
INSERT INTO "new_Event" ("action", "app", "context", "eventId", "featureFlag", "id", "receivedAt", "release", "sessionId", "timestamp", "userId", "value", "variant") SELECT "action", "app", "context", "eventId", "featureFlag", "id", "receivedAt", "release", "sessionId", "timestamp", "userId", "value", "variant" FROM "Event";
DROP TABLE "Event";
ALTER TABLE "new_Event" RENAME TO "Event";
CREATE UNIQUE INDEX "Event_eventId_key" ON "Event"("eventId");
CREATE INDEX "Event_featureFlag_action_idx" ON "Event"("featureFlag", "action");
CREATE INDEX "Event_action_timestamp_idx" ON "Event"("action", "timestamp");
CREATE INDEX "Event_quarantined_featureFlag_idx" ON "Event"("quarantined", "featureFlag");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
