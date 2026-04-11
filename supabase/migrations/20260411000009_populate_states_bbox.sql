-- Populate the states table with approximate bounding-box geometries.
-- These are used by pois_along_route (ST_Intersects) and pois_in_state
-- (ST_Within fallback). Exact boundaries are not needed — bboxes are
-- sufficient to identify which states a route passes through.
--
-- Each row: (name, abbreviation, statefp, geom as MultiPolygon bbox)

INSERT INTO states (name, abbreviation, statefp, geom) VALUES
  ('Alabama',              'AL', '01', ST_Multi(ST_MakeEnvelope(-88.47,  30.22, -84.89,  35.01, 4326))),
  ('Alaska',               'AK', '02', ST_Multi(ST_MakeEnvelope(-179.15, 51.21, -129.97, 71.41, 4326))),
  ('Arizona',              'AZ', '04', ST_Multi(ST_MakeEnvelope(-114.82, 31.33, -109.05, 37.00, 4326))),
  ('Arkansas',             'AR', '05', ST_Multi(ST_MakeEnvelope( -94.62, 33.00,  -89.64, 36.50, 4326))),
  ('California',           'CA', '06', ST_Multi(ST_MakeEnvelope(-124.41, 32.53, -114.13, 42.01, 4326))),
  ('Colorado',             'CO', '08', ST_Multi(ST_MakeEnvelope(-109.06, 36.99, -102.04, 41.00, 4326))),
  ('Connecticut',          'CT', '09', ST_Multi(ST_MakeEnvelope( -73.73, 40.99,  -71.79, 42.05, 4326))),
  ('Delaware',             'DE', '10', ST_Multi(ST_MakeEnvelope( -75.79, 38.45,  -74.98, 39.84, 4326))),
  ('District of Columbia', 'DC', '11', ST_Multi(ST_MakeEnvelope( -77.12, 38.79,  -76.91, 38.99, 4326))),
  ('Florida',              'FL', '12', ST_Multi(ST_MakeEnvelope( -87.63, 24.52,  -80.03, 31.00, 4326))),
  ('Georgia',              'GA', '13', ST_Multi(ST_MakeEnvelope( -85.61, 30.36,  -80.84, 35.00, 4326))),
  ('Hawaii',               'HI', '15', ST_Multi(ST_MakeEnvelope(-160.25, 18.92, -154.81, 22.24, 4326))),
  ('Idaho',                'ID', '16', ST_Multi(ST_MakeEnvelope(-117.24, 41.99, -111.04, 49.00, 4326))),
  ('Illinois',             'IL', '17', ST_Multi(ST_MakeEnvelope( -91.51, 36.97,  -87.50, 42.51, 4326))),
  ('Indiana',              'IN', '18', ST_Multi(ST_MakeEnvelope( -88.10, 37.77,  -84.78, 41.76, 4326))),
  ('Iowa',                 'IA', '19', ST_Multi(ST_MakeEnvelope( -96.64, 40.37,  -90.14, 43.50, 4326))),
  ('Kansas',               'KS', '20', ST_Multi(ST_MakeEnvelope(-102.05, 36.99,  -94.59, 40.00, 4326))),
  ('Kentucky',             'KY', '21', ST_Multi(ST_MakeEnvelope( -89.57, 36.50,  -81.96, 39.15, 4326))),
  ('Louisiana',            'LA', '22', ST_Multi(ST_MakeEnvelope( -94.04, 28.93,  -88.82, 33.02, 4326))),
  ('Maine',                'ME', '23', ST_Multi(ST_MakeEnvelope( -71.08, 43.06,  -66.95, 47.46, 4326))),
  ('Maryland',             'MD', '24', ST_Multi(ST_MakeEnvelope( -79.49, 37.89,  -75.05, 39.72, 4326))),
  ('Massachusetts',        'MA', '25', ST_Multi(ST_MakeEnvelope( -73.51, 41.24,  -69.93, 42.89, 4326))),
  ('Michigan',             'MI', '26', ST_Multi(ST_MakeEnvelope( -90.42, 41.70,  -82.41, 48.30, 4326))),
  ('Minnesota',            'MN', '27', ST_Multi(ST_MakeEnvelope( -97.24, 43.50,  -89.49, 49.38, 4326))),
  ('Mississippi',          'MS', '28', ST_Multi(ST_MakeEnvelope( -91.65, 30.17,  -88.10, 35.01, 4326))),
  ('Missouri',             'MO', '29', ST_Multi(ST_MakeEnvelope( -95.77, 35.99,  -89.10, 40.61, 4326))),
  ('Montana',              'MT', '30', ST_Multi(ST_MakeEnvelope(-116.05, 44.36, -104.04, 49.00, 4326))),
  ('Nebraska',             'NE', '31', ST_Multi(ST_MakeEnvelope(-104.05, 40.00,  -95.31, 43.00, 4326))),
  ('Nevada',               'NV', '32', ST_Multi(ST_MakeEnvelope(-120.01, 35.00, -114.04, 42.00, 4326))),
  ('New Hampshire',        'NH', '33', ST_Multi(ST_MakeEnvelope( -72.56, 42.70,  -70.61, 45.31, 4326))),
  ('New Jersey',           'NJ', '34', ST_Multi(ST_MakeEnvelope( -75.56, 38.93,  -73.89, 41.36, 4326))),
  ('New Mexico',           'NM', '35', ST_Multi(ST_MakeEnvelope(-109.05, 31.33, -103.00, 37.00, 4326))),
  ('New York',             'NY', '36', ST_Multi(ST_MakeEnvelope( -79.76, 40.50,  -71.86, 45.01, 4326))),
  ('North Carolina',       'NC', '37', ST_Multi(ST_MakeEnvelope( -84.32, 33.84,  -75.46, 36.59, 4326))),
  ('North Dakota',         'ND', '38', ST_Multi(ST_MakeEnvelope(-104.05, 45.94,  -96.55, 49.00, 4326))),
  ('Ohio',                 'OH', '39', ST_Multi(ST_MakeEnvelope( -84.82, 38.40,  -80.52, 42.33, 4326))),
  ('Oklahoma',             'OK', '40', ST_Multi(ST_MakeEnvelope(-103.00, 33.62,  -94.43, 37.00, 4326))),
  ('Oregon',               'OR', '41', ST_Multi(ST_MakeEnvelope(-124.57, 41.99, -116.46, 46.27, 4326))),
  ('Pennsylvania',         'PA', '42', ST_Multi(ST_MakeEnvelope( -80.52, 39.72,  -74.69, 42.27, 4326))),
  ('Rhode Island',         'RI', '44', ST_Multi(ST_MakeEnvelope( -71.86, 41.15,  -71.12, 42.02, 4326))),
  ('South Carolina',       'SC', '45', ST_Multi(ST_MakeEnvelope( -83.35, 32.05,  -78.54, 35.22, 4326))),
  ('South Dakota',         'SD', '46', ST_Multi(ST_MakeEnvelope(-104.06, 42.48,  -96.44, 45.95, 4326))),
  ('Tennessee',            'TN', '47', ST_Multi(ST_MakeEnvelope( -90.31, 34.98,  -81.65, 36.68, 4326))),
  ('Texas',                'TX', '48', ST_Multi(ST_MakeEnvelope(-106.65, 25.84,  -93.51, 36.50, 4326))),
  ('Utah',                 'UT', '49', ST_Multi(ST_MakeEnvelope(-114.05, 36.99, -109.04, 42.00, 4326))),
  ('Vermont',              'VT', '50', ST_Multi(ST_MakeEnvelope( -73.44, 42.73,  -71.50, 45.02, 4326))),
  ('Virginia',             'VA', '51', ST_Multi(ST_MakeEnvelope( -83.68, 36.54,  -75.24, 39.46, 4326))),
  ('Washington',           'WA', '53', ST_Multi(ST_MakeEnvelope(-124.74, 45.54, -116.92, 49.00, 4326))),
  ('West Virginia',        'WV', '54', ST_Multi(ST_MakeEnvelope( -82.64, 37.20,  -77.72, 40.64, 4326))),
  ('Wisconsin',            'WI', '55', ST_Multi(ST_MakeEnvelope( -92.89, 42.49,  -86.25, 47.31, 4326))),
  ('Wyoming',              'WY', '56', ST_Multi(ST_MakeEnvelope(-111.06, 40.99, -104.05, 45.01, 4326)))
ON CONFLICT (abbreviation) DO UPDATE
  SET name    = EXCLUDED.name,
      statefp = EXCLUDED.statefp,
      geom    = EXCLUDED.geom;

CREATE INDEX IF NOT EXISTS states_geom_idx ON states USING GIST (geom);
