-- Step 1: Run against 'postgres' database
-- psql -U postgres -c "CREATE DATABASE cityscope;"

-- Step 2: Run against 'cityscope' database
-- psql -U postgres -d cityscope -f cityscope-backend/src/scripts/setup-db.sql

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS cities (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  country VARCHAR(100) NOT NULL,
  center_lng DOUBLE PRECISION NOT NULL,
  center_lat DOUBLE PRECISION NOT NULL,
  default_zoom SMALLINT NOT NULL DEFAULT 12,
  bounds JSONB
);

CREATE TABLE IF NOT EXISTS districts (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  geom GEOMETRY(MultiPolygon, 4326) NOT NULL,
  city_id VARCHAR(50) NOT NULL REFERENCES cities(id)
);

CREATE INDEX IF NOT EXISTS idx_districts_geom ON districts USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_districts_city_id ON districts(city_id);

CREATE TABLE IF NOT EXISTS pois (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  category VARCHAR(100) NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  city_id VARCHAR(50) NOT NULL REFERENCES cities(id)
);

CREATE INDEX IF NOT EXISTS idx_pois_category ON pois (category);
CREATE INDEX IF NOT EXISTS idx_pois_city_id ON pois(city_id);
