-- Quarantine events already stored for flags that have no registered feature spec.
UPDATE "Event"
SET "quarantined" = true
WHERE "featureFlag" IS NOT NULL
  AND "featureFlag" NOT IN (SELECT "key" FROM "Feature");
