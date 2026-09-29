-- AlterTable
ALTER TABLE "Feature" ADD COLUMN     "treatmentShare" DOUBLE PRECISION NOT NULL DEFAULT 0.5;

-- AlterTable
ALTER TABLE "FeatureKpi" ADD COLUMN     "valueSource" TEXT NOT NULL DEFAULT '';

