-- Fix sync_geographic_ids trigger: scope column was renamed to effect_scope.
CREATE OR REPLACE FUNCTION sync_geographic_ids()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.effect_scope = 'point' AND NEW.geom IS NOT NULL THEN
    IF TG_OP = 'INSERT' OR NEW.geom IS DISTINCT FROM OLD.geom THEN
      SELECT id INTO NEW.state_id
        FROM states
        WHERE ST_Within(NEW.geom, geom)
        LIMIT 1;

      SELECT id INTO NEW.county_id
        FROM counties
        WHERE ST_Within(NEW.geom, geom)
        LIMIT 1;

      -- city_id may be NULL for unincorporated areas
      SELECT id INTO NEW.city_id
        FROM cities
        WHERE ST_Within(NEW.geom, geom)
        LIMIT 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
