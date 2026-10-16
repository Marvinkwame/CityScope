-- Migration 003: repair invalid district outlines.
-- Simplifying the source outlines (fetch-districts.ts) left 65 of 202 crossing
-- over themselves. ST_Area undercounts those (Munich's Bogenhausen read
-- 16.9 km² instead of 20.0) and set operations such as ST_Union fail on them.
-- Safe to rerun: a second run finds nothing invalid and changes nothing.

BEGIN;

-- Two Sydney outlines (Edgecliff, Woollahra) are slivers with no area at all;
-- one is a single point. Repair leaves nothing of them, so they go.
DELETE FROM districts
WHERE NOT ST_IsValid(geom)
  AND ST_IsEmpty(ST_CollectionExtract(ST_MakeValid(geom, 'method=structure'), 3));

-- 'structure' rebuilds each polygon from its rings, which suits crossings that
-- are simplification artefacts. CollectionExtract keeps only the polygon parts
-- and ST_Multi keeps the column's MultiPolygon type.
UPDATE districts
SET geom = ST_Multi(ST_CollectionExtract(ST_MakeValid(geom, 'method=structure'), 3))
WHERE NOT ST_IsValid(geom);

COMMIT;
