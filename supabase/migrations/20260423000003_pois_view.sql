-- Create a pois view that exposes lat/lng extracted from the geom column.
-- POIDetailPanel.tsx and any other client queries use .from("pois") to get
-- these columns without needing PostGIS functions on the client side.

CREATE OR REPLACE VIEW pois AS
SELECT
  id,
  title,
  description,
  long_description,
  tags,
  ST_Y(geom::geometry) AS lat,
  ST_X(geom::geometry) AS lng,
  is_verified,
  legislation_url,
  attributes
FROM points_of_interest;
