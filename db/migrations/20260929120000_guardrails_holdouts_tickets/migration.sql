-- AlterTable
ALTER TABLE "Feature" ADD COLUMN     "financeApproved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "financeApprovedBy" TEXT,
ADD COLUMN     "holdoutDistricts" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "killReason" TEXT,
ADD COLUMN     "killedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "FeatureKpi" ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'PRIMARY',
ADD COLUMN     "valueHigh" DOUBLE PRECISION,
ADD COLUMN     "valueLow" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "monthlySavings" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Ticket_createdAt_idx" ON "Ticket"("createdAt");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- End migration

