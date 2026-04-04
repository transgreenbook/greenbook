-- Bidirectional geographic resolution trigger.
--
-- Direction A — Point → Region (geom is provided):
--   Finds the state/county/city the point falls within via ST_Within.
--   Sets state_id, county_id, city_id, state_abbr, county_name, city_name.
--   city_name is '-' when the point is outside any incorporated place.
--
-- Direction B — Region → Point (geom is NULL, state_abbr/county_name/city_name provided):
--   Resolves state by abbreviation or full name (case-insensitive).
--   Resolves county and city within that state (case-insensitive name match).
--   Sets geom to the centroid of the finest-grained region specified.
--   Populates state_id, county_id, city_id, and normalises state_abbr to abbreviation.

CREATE OR REPLACE FUNCTION sync_geographic_ids()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_state_id   INT;
  v_county_id  INT;
  v_city_id    INT;
  v_abbr       TEXT;
  v_county     TEXT;
  v_city       TEXT;
  v_centroid   GEOMETRY;
BEGIN
  -- ── Direction A: geom provided → derive region ───────────────────────────
  IF NEW.geom IS NOT NULL AND NEW.effect_scope = 'point' THEN
    IF TG_OP = 'INSERT' OR NEW.geom IS DISTINCT FROM OLD.geom THEN

      -- State
      SELECT id, abbreviation, name
        INTO NEW.state_id, NEW.state_abbr, v_county  -- reuse v_county as temp
        FROM states
        WHERE ST_Within(NEW.geom, geom)
        LIMIT 1;

      -- County
      SELECT id, name
        INTO NEW.county_id, NEW.county_name
        FROM counties
        WHERE ST_Within(NEW.geom, geom)
        LIMIT 1;

      -- City (may be NULL for unincorporated areas)
      SELECT id, name
        INTO NEW.city_id, v_city
        FROM cities
        WHERE ST_Within(NEW.geom, geom)
        LIMIT 1;
      NEW.city_name := COALESCE(v_city, '-');

    END IF;

  -- ── Direction B: no geom → derive geom from region names ─────────────────
  ELSIF NEW.geom IS NULL AND NEW.state_abbr IS NOT NULL THEN

    -- Resolve state by abbreviation OR full name
    SELECT id, abbreviation
      INTO v_state_id, v_abbr
      FROM states
      WHERE abbreviation ILIKE NEW.state_abbr
         OR name         ILIKE NEW.state_abbr
      LIMIT 1;

    IF v_state_id IS NULL THEN
      RAISE EXCEPTION 'Could not resolve state from "%"', NEW.state_abbr;
    END IF;

    NEW.state_id   := v_state_id;
    NEW.state_abbr := v_abbr;  -- normalise to abbreviation

    -- Resolve county (optional)
    IF NEW.county_name IS NOT NULL AND NEW.county_name != '-' THEN
      SELECT id INTO v_county_id
        FROM counties
        WHERE state_id = v_state_id
          AND name ILIKE NEW.county_name
        LIMIT 1;
      NEW.county_id := v_county_id;
    END IF;

    -- Resolve city (optional)
    IF NEW.city_name IS NOT NULL AND NEW.city_name != '-' THEN
      SELECT id INTO v_city_id
        FROM cities
        WHERE state_id = v_state_id
          AND name ILIKE NEW.city_name
        LIMIT 1;
      NEW.city_id := v_city_id;
    END IF;

    -- Set geom to centroid of finest-grained region available
    IF v_city_id IS NOT NULL THEN
      SELECT ST_Centroid(geom) INTO v_centroid FROM cities   WHERE id = v_city_id;
    ELSIF v_county_id IS NOT NULL THEN
      SELECT ST_Centroid(geom) INTO v_centroid FROM counties WHERE id = v_county_id;
    ELSE
      SELECT ST_Centroid(geom) INTO v_centroid FROM states   WHERE id = v_state_id;
    END IF;

    NEW.geom := v_centroid;

  END IF;

  RETURN NEW;
END;
$$;
