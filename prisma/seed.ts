import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

// ============================================
// 1. SUPPLY CHAIN VALIDATION & COST TRACKING
// ============================================

interface SupplyChainWithCost extends Prisma.SupplyChainGetPayload<{}> {
  cost: number;
}

async function getValidatedSupplyChainCosts(
  startDate: Date,
  endDate: Date
): Promise<SupplyChainWithCost[]> {
  // Validate and retrieve only completed supply chain entries
  const supplyChainData = await prisma.supplyChain.findMany({
    where: {
      status: "Delivered", // Only count delivered items
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  // Calculate cost per item (quantity * unit_cost estimation)
  // Assuming cost is derived from quantity and warehouse distance
  return supplyChainData.map((item) => ({
    ...item,
    cost: item.quantity * 50, // Base cost estimation per unit
  }));
}

// ============================================
// 2. MONTHLY CROP ROI (Using Continuous Aggregate)
// ============================================

interface MonthlyCropROI {
  bucket: Date;
  district: string;
  crop: string;
  estimated_revenue: number;
  efficiency_ratio: number;
  total_cost: number;
  roi_percentage: number;
}

async function getMonthlyCropROI(
  district?: string,
  crop?: string
): Promise<MonthlyCropROI[]> {
  const query = `
    SELECT
      bucket,
      district,
      crop,
      estimated_revenue,
      efficiency_ratio,
      COALESCE(estimated_revenue * 0.3, 0) as total_cost,
      CASE 
        WHEN COALESCE(estimated_revenue * 0.3, 0) = 0 THEN 0
        ELSE ((estimated_revenue - (estimated_revenue * 0.3)) / (estimated_revenue * 0.3)) * 100
      END as roi_percentage
    FROM monthly_crop_roi
    ${district ? `WHERE district = '${district}'` : ""}
    ${crop ? `${district ? "AND" : "WHERE"} crop = '${crop}'` : ""}
    ORDER BY bucket DESC;
  `;

  const results = await prisma.$queryRaw<MonthlyCropROI[]>(
    query as any
  );
  return results;
}

// ============================================
// 3. REAL-TIME WEEKLY ROI CALCULATION
// ============================================

interface WeeklyROI {
  bucket: Date;
  district: string;
  total_revenue: number;
  total_cost: number;
  roi_percentage: number;
}

async function getWeeklyROI(
  district: string,
  weeksBack: number = 12
): Promise<WeeklyROI[]> {
  const query = `
    SELECT
      time_bucket('1 week', fd."createdAt") AS bucket,
      fd.district,
      SUM(fd.yield * 150) as total_revenue,
      SUM(COALESCE(sc.cost, 0)) as total_cost,
      CASE
        WHEN SUM(COALESCE(sc.cost, 0)) = 0 THEN 0
        ELSE ((SUM(fd.yield * 150) - SUM(COALESCE(sc.cost, 0))) / 
              NULLIF(SUM(COALESCE(sc.cost, 0)), 0)) * 100
      END as roi_percentage
    FROM "FarmingData" fd
    LEFT JOIN "SupplyChain" sc 
      ON fd.district = sc.warehouse 
      AND sc.status = 'Delivered'
      AND sc."createdAt" >= fd."createdAt" - INTERVAL '7 days'
    WHERE 
      fd.district = $1 
      AND fd."createdAt" >= NOW() - INTERVAL '${weeksBack} weeks'
    GROUP BY bucket, fd.district
    ORDER BY bucket DESC;
  `;

  const results = await prisma.$queryRaw<WeeklyROI[]>(
    query as any
  );
  return results;
}

// ============================================
// 4. DAILY ROI (High-Frequency Analysis)
// ============================================

interface DailyROI {
  date: Date;
  district: string;
  crop: string;
  revenue: number;
  cost: number;
  roi_percentage: number;
}

async function getDailyROI(
  district: string,
  daysBack: number = 30
): Promise<DailyROI[]> {
  const query = `
    SELECT
      time_bucket('1 day', fd."createdAt") AS date,
      fd.district,
      fd.crop,
      SUM(fd.yield * 150) as revenue,
      COALESCE(SUM(sc.cost), 0) as cost,
      CASE
        WHEN COALESCE(SUM(sc.cost), 0) = 0 THEN 0
        ELSE ((SUM(fd.yield * 150) - COALESCE(SUM(sc.cost), 0)) / 
              NULLIF(COALESCE(SUM(sc.cost), 0), 1)) * 100
      END as roi_percentage
    FROM "FarmingData" fd
    LEFT JOIN "SupplyChain" sc
      ON fd.district = sc.warehouse
      AND sc.status = 'Delivered'
      AND sc."createdAt" >= fd."createdAt" - INTERVAL '1 day'
    WHERE fd.district = $1 AND fd."createdAt" >= NOW() - INTERVAL '${daysBack} days'
    GROUP BY date, fd.district, fd.crop
    ORDER BY date DESC;
  `;

  const results = await prisma.$queryRaw<DailyROI[]>(
    query as any
  );
  return results;
}

// ============================================
// 5. COMPARE ROI ACROSS DISTRICTS
// ============================================

interface DistrictComparison {
  district: string;
  avg_roi: number;
  total_revenue: number;
  total_cost: number;
  crop_count: number;
}

async function compareDistrictROI(): Promise<DistrictComparison[]> {
  const query = `
    SELECT
      fd.district,
      AVG(
        CASE
          WHEN SUM(COALESCE(sc.cost, 0)) = 0 THEN 0
          ELSE ((SUM(fd.yield * 150) - SUM(COALESCE(sc.cost, 0))) / 
                NULLIF(SUM(COALESCE(sc.cost, 0)), 0)) * 100
        END
      ) as avg_roi,
      SUM(fd.yield * 150) as total_revenue,
      SUM(COALESCE(sc.cost, 0)) as total_cost,
      COUNT(DISTINCT fd.crop) as crop_count
    FROM "FarmingData" fd
    LEFT JOIN "SupplyChain" sc
      ON fd.district = sc.warehouse
      AND sc.status = 'Delivered'
    WHERE fd."createdAt" >= NOW() - INTERVAL '90 days'
    GROUP BY fd.district
    ORDER BY avg_roi DESC;
  `;

  const results = await prisma.$queryRaw<DistrictComparison[]>(
    query as any
  );
  return results;
}

// ============================================
// 6. EXAMPLE: REST API ENDPOINT
// ============================================

export async function generateROIDashboard(
  district: string,
  timeframe: "daily" | "weekly" | "monthly" = "weekly"
) {
  try {
    const monthlyData = await getMonthlyCropROI(district);
    const weeklyData = await getWeeklyROI(district);
    const districtComparison = await compareDistrictROI();

    return {
      dashboard: {
        district,
        timeframe,
        monthlyROI: monthlyData,
        weeklyROI: weeklyData,
        districtBenchmark: districtComparison.find(
          (d) => d.district === district
        ),
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error("ROI Dashboard Generation Error:", error);
    throw error;
  }
}

// ============================================
// EXAMPLE USAGE
// ============================================

async function main() {
  try {
    console.log("📊 Generating ROI Dashboard...");

    // Get monthly aggregate ROI (fast - uses continuous aggregate)
    const monthlyROI = await getMonthlyCropROI("Thanjavur");
    console.log("Monthly ROI (Thanjavur):", monthlyROI);

    // Get weekly ROI with real-time calculation
    const weeklyROI = await getWeeklyROI("Thanjavur", 12);
    console.log("Weekly ROI (Last 12 weeks):", weeklyROI);

    // Compare districts
    const comparison = await compareDistrictROI();
    console.log("District Comparison:", comparison);

    // Full dashboard
    const dashboard = await generateROIDashboard("Thanjavur", "weekly");
    console.log("Complete Dashboard:", JSON.stringify(dashboard, null, 2));
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();