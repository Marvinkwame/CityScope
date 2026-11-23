BEGIN;
ALTER TABLE reach_nearest ADD COLUMN IF NOT EXISTS walk geometry(LineString, 4326);
ALTER TABLE reach_nearest DROP CONSTRAINT IF EXISTS reach_nearest_walk_for_network;
ALTER TABLE reach_nearest ADD CONSTRAINT reach_nearest_walk_for_network
  CHECK (method <> 'network' OR walk IS NOT NULL);
COMMIT;
