-- Migration 002: give POIs a real geometry so PostGIS can do spatial joins.
-- A generated STORED column keeps geom in sync with lat/lng automatically,
-- so the existing /pois endpoint and all Turf code keep working unchanged.

ALTER TABLE pois ADD COLUMN IF NOT EXISTS geom geometry(Point,4326)
  GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)) STORED;

CREATE INDEX IF NOT EXISTS idx_pois_geom ON pois USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_districts_geom ON districts USING GIST (geom);
