-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Convert FarmingData to a Hypertable for fast time-series ROI analysis
SELECT create_hypertable('"FarmingData"', 'createdAt', if_not_exists => TRUE);

-- Create a continuous aggregate to calculate ROI per District/Crop monthly
CREATE MATERIALIZED VIEW IF NOT EXISTS monthly_crop_roi
WITH (timescaledb.continuous_aggregate = 'TRUE') AS
SELECT
    time_bucket('1 month', "createdAt") AS bucket,
    district,
    crop,
    SUM(yield * 150) as estimated_revenue,
    SUM(yield) / NULLIF(SUM(area), 0) as efficiency_ratio
FROM "FarmingData"
GROUP BY bucket, district, crop;

-- Create an index for faster queries on the hypertable
CREATE INDEX IF NOT EXISTS idx_farming_data_district_crop ON "FarmingData" (district, crop, "createdAt" DESC);

-- Create a policy refresh job for the continuous aggregate
SELECT add_continuous_aggregate_policy('monthly_crop_roi', start_offset => '2 months', if_not_exists => true);
