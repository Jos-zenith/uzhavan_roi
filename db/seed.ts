/**
 * CLI entry for the demo scenario (the scenario itself is lib/demo/seed.ts,
 * shared with the "Reset demo" button).
 *
 *   npm run db:seed               refuses if the database has data
 *   npm run db:seed -- --reset    replaces everything with the demo
 *   tsx db/seed.ts --if-empty     loads the demo only into an empty database (run by every deploy)
 */
import { db } from "../lib/db"
import { seedDemo } from "../lib/demo/seed"

async function main() {
  // Seeding wipes every table. Never do that to a database with data in it by accident.
  const existing = await db.feature.count()
  if (process.argv.includes("--if-empty")) {
    if (process.env.SKIP_DEMO_SEED) return console.log("SKIP_DEMO_SEED is set; not loading demo data.")
    if (existing > 0) return console.log(`Database already has ${existing} features; leaving it alone.`)
    console.log("Empty database: loading the demo scenario.")
  } else if (existing > 0 && !process.argv.includes("--reset")) {
    console.error(
      `Refusing to seed: this database already has ${existing} features, and seeding deletes everything.\n` +
        "If you really want to replace it with demo data, run: npm run db:seed -- --reset",
    )
    process.exit(1)
  }
  const r = await seedDemo(db)
  console.log(`Seeded ${r.kpis} KPIs, ${r.features} features, ${r.events} events.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
