import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const directUrl = process.env.DATABASE_URL;
    
    if (!directUrl) {
      return NextResponse.json(
        { error: "DATABASE_URL not configured" },
        { status: 500 }
      );
    }

    // Using the direct PostgreSQL connection to execute SQL
    const response = await fetch(new URL("/db/execute", directUrl).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sql: `
          CREATE EXTENSION IF NOT EXISTS timescaledb;
          SELECT create_hypertable('"FarmingData"', 'createdAt', if_not_exists => TRUE);
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
          CREATE INDEX IF NOT EXISTS idx_farming_data_district_crop 
          ON "FarmingData" (district, crop, "createdAt" DESC);
        `,
      }),
    });

    const data = await response.json();
    
    return NextResponse.json({
      message: "TimescaleDB setup completed successfully!",
      details: data,
    });
  } catch (error) {
    console.error("TimescaleDB setup error:", error);
    return NextResponse.json(
      { error: "Failed to setup TimescaleDB" },
      { status: 500 }
    );
  }
}
