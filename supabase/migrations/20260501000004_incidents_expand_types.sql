alter table incidents
  drop constraint if exists incidents_incident_type_check;

alter table incidents
  add constraint incidents_incident_type_check check (incident_type in (
    -- violence & threats
    'assault',
    'murder',
    'sexual_assault',
    'harassment',
    'property_crime',
    'threat',              -- credible threat against a person, venue, or event
    -- institutional
    'gov_discrimination',  -- govt agency denying services (DMV, vital records, etc.)
    'law_enforcement_failure',    -- police not investigating / ignoring trans victims
    'law_enforcement_misconduct', -- police targeting, profiling, or mistreating trans people
    'border_incident',     -- TSA, CBP, or border crossing issues
    'healthcare_denial',   -- hospital/clinic refusing care
    -- climate
    'demonstration',       -- anti-trans rally or protest creating unsafe conditions
    'political_rhetoric',  -- anti-trans statements by elected officials or law enforcement leadership
    'vigilante',           -- private citizens confronting or filming trans people
    -- fallback
    'other'
  ));
