-- CreateTable
CREATE TABLE "KpiDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "calculation" TEXT NOT NULL,
    "numeratorAction" TEXT NOT NULL,
    "denominatorAction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KpiDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feature" (
    "id" TEXT NOT NULL,
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
    "releasedAt" TIMESTAMP(3),
    "decision" TEXT,
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewNote" (
    "id" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureKpi" (
    "id" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "kpiId" TEXT NOT NULL,
    "baseline" DOUBLE PRECISION NOT NULL,
    "targetDelta" DOUBLE PRECISION NOT NULL,
    "monthlyVolume" DOUBLE PRECISION NOT NULL,
    "valuePerUnit" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "FeatureKpi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostEntry" (
    "id" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "recurrence" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "quarantined" BOOLEAN NOT NULL DEFAULT false,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "app" TEXT NOT NULL,
    "release" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "featureFlag" TEXT,
    "variant" TEXT,
    "action" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "context" TEXT NOT NULL DEFAULT '{}',

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KpiDefinition_key_key" ON "KpiDefinition"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Feature_key_key" ON "Feature"("key");

-- CreateIndex
CREATE INDEX "ReviewNote_featureId_createdAt_idx" ON "ReviewNote"("featureId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureKpi_featureId_kpiId_key" ON "FeatureKpi"("featureId", "kpiId");

-- CreateIndex
CREATE UNIQUE INDEX "Event_eventId_key" ON "Event"("eventId");

-- CreateIndex
CREATE INDEX "Event_featureFlag_action_idx" ON "Event"("featureFlag", "action");

-- CreateIndex
CREATE INDEX "Event_action_timestamp_idx" ON "Event"("action", "timestamp");

-- CreateIndex
CREATE INDEX "Event_quarantined_featureFlag_idx" ON "Event"("quarantined", "featureFlag");

-- AddForeignKey
ALTER TABLE "ReviewNote" ADD CONSTRAINT "ReviewNote_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureKpi" ADD CONSTRAINT "FeatureKpi_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureKpi" ADD CONSTRAINT "FeatureKpi_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "KpiDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostEntry" ADD CONSTRAINT "CostEntry_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;
