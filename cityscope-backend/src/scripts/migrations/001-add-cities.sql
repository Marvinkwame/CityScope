-- Migration 001: Add multi-city support
-- Run against 'cityscope' database:
-- psql -U postgres -d cityscope -f cityscope-backend/src/scripts/migrations/001-add-cities.sql

-- Cities table
CREATE TABLE IF NOT EXISTS cities (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  country VARCHAR(100) NOT NULL,
  center_lng DOUBLE PRECISION NOT NULL,
  center_lat DOUBLE PRECISION NOT NULL,
  default_zoom SMALLINT NOT NULL DEFAULT 12,
  bounds JSONB
);

-- Add city_id to existing tables
ALTER TABLE districts ADD COLUMN IF NOT EXISTS city_id VARCHAR(50) REFERENCES cities(id);
ALTER TABLE pois ADD COLUMN IF NOT EXISTS city_id VARCHAR(50) REFERENCES cities(id);

CREATE INDEX IF NOT EXISTS idx_districts_city_id ON districts(city_id);
CREATE INDEX IF NOT EXISTS idx_pois_city_id ON pois(city_id);

-- Backfill existing Berlin data
INSERT INTO cities (id, name, country, center_lng, center_lat, default_zoom, bounds)
VALUES ('berlin', 'Berlin', 'Germany', 13.405, 52.52, 12,
  '{"south":52.34,"west":13.08,"north":52.68,"east":13.76}')
ON CONFLICT (id) DO NOTHING;

UPDATE districts SET city_id = 'berlin' WHERE city_id IS NULL;
UPDATE pois SET city_id = 'berlin' WHERE city_id IS NULL;

ALTER TABLE districts ALTER COLUMN city_id SET NOT NULL;
ALTER TABLE pois ALTER COLUMN city_id SET NOT NULL;
