-- Migration 004: the everyday reach tables.
-- Adds a geography index on pois, so nearest-place distances are measured in
-- metres and can be served by an index, plus the tables the reach feature
-- writes and reads: parks, reach_cells, reach_nearest, reach_calibration and
-- reach_payloads.
-- reach_nearest.place_id deliberately has no foreign key. Place ids change on
-- every reload of the place data, so reach is rebuilt after each reload rather
-- than keeping ids that could point at rows that no longer exist.
-- Safe to rerun: every statement is IF NOT EXISTS and the file runs as one
-- transaction, so a second run finds everything in place and changes nothing.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_pois_geog ON pois USING GIST ((geom::geography));

CREATE TABLE IF NOT EXISTS parks (
  id serial PRIMARY KEY,
  city_id varchar(50) NOT NULL REFERENCES cities(id),
  osm_id text NOT NULL,
  name text,
  geom geometry(MultiPolygon, 4326) NOT NULL,
  area_m2 double precision NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_parks_geog ON parks USING GIST ((geom::geography));
CREATE INDEX IF NOT EXISTS idx_parks_city_id ON parks (city_id);

CREATE TABLE IF NOT EXISTS reach_cells (
  city_id varchar(50) NOT NULL REFERENCES cities(id),
  h3 text NOT NULL,
  residents integer NOT NULL,
  outline geometry(Polygon, 4326) NOT NULL,
  centre geometry(Point, 4326) NOT NULL,
  PRIMARY KEY (city_id, h3)
);

CREATE TABLE IF NOT EXISTS reach_nearest (
  city_id varchar(50) NOT NULL,
  h3 text NOT NULL,
  need text NOT NULL,
  place_kind text NOT NULL CHECK (place_kind IN ('poi', 'park')),
  place_id integer NOT NULL,
  metres integer NOT NULL,
  method text NOT NULL DEFAULT 'estimate',
  PRIMARY KEY (city_id, h3, need),
  FOREIGN KEY (city_id, h3) REFERENCES reach_cells (city_id, h3) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reach_calibration (
  city_id varchar(50) PRIMARY KEY REFERENCES cities(id),
  method text NOT NULL,
  metres_per_minute real NOT NULL,
  k_low real NOT NULL,
  k_high real NOT NULL,
  agreement jsonb NOT NULL,          -- {"5":0.91,"10":…}
  passing_stops integer[] NOT NULL,
  sample_size integer NOT NULL,
  checks jsonb NOT NULL DEFAULT '{}',
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reach_payloads (
  city_id varchar(50) PRIMARY KEY REFERENCES cities(id),
  body bytea NOT NULL,
  etag text NOT NULL,
  built_at timestamptz NOT NULL
);

COMMIT;
