-- CreateTable
CREATE TABLE "KpiDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "calculation" TEXT NOT NULL,
    "numeratorAction" TEXT NOT NULL,
    "denominatorAction" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Feature" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "goals" TEXT NOT NULL,
    "attributionMethod" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "minSamplePerArm" INTEGER NOT NULL,
    "observationDays" INTEGER NOT NULL,
    "horizonMonths" INTEGER NOT NULL DEFAULT 12,
    "qualitativeBenefits" TEXT NOT NULL DEFAULT '',
    "productApproved" BOOLEAN NOT NULL DEFAULT false,
    "engineeringApproved" BOOLEAN NOT NULL DEFAULT false,
    "analyticsApproved" BOOLEAN NOT NULL DEFAULT false,
    "releaseVersion" TEXT,
    "releasedAt" DATETIME,
    "decision" TEXT,
    "decisionNote" TEXT,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FeatureKpi" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "featureId" TEXT NOT NULL,
    "kpiId" TEXT NOT NULL,
    "baseline" REAL NOT NULL,
    "targetDelta" REAL NOT NULL,
    "monthlyVolume" REAL NOT NULL,
    "valuePerUnit" REAL NOT NULL,
    CONSTRAINT "FeatureKpi_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeatureKpi_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "KpiDefinition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CostEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "featureId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "recurrence" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CostEntry_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
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

-- CreateIndex
CREATE UNIQUE INDEX "KpiDefinition_key_key" ON "KpiDefinition"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Feature_key_key" ON "Feature"("key");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureKpi_featureId_kpiId_key" ON "FeatureKpi"("featureId", "kpiId");

-- CreateIndex
CREATE UNIQUE INDEX "Event_eventId_key" ON "Event"("eventId");

-- CreateIndex
CREATE INDEX "Event_featureFlag_action_idx" ON "Event"("featureFlag", "action");

-- CreateIndex
CREATE INDEX "Event_action_timestamp_idx" ON "Event"("action", "timestamp");
