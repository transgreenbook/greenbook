create table incident_type_config (
  incident_type   text primary key,
  severity_weight numeric(4,2) not null default 1.0,
  label           text not null,
  description     text
);

insert into incident_type_config (incident_type, severity_weight, label, description) values
  -- violence & threats (highest weight — direct physical danger)
  ('murder',                     10.0, 'Murder',                      'Killing of a trans person'),
  ('assault',                     8.0, 'Physical Assault',            'Physical attack on a trans person'),
  ('sexual_assault',              8.0, 'Sexual Assault',              'Sexual violence against a trans person'),
  ('threat',                      6.0, 'Credible Threat',             'Credible threat against a person, venue, or event'),
  ('harassment',                  4.0, 'Harassment',                  'Verbal harassment, stalking, or non-physical intimidation'),
  ('property_crime',              3.0, 'Property Crime',              'Vandalism, arson, or destruction targeting LGBTQ+ property'),
  -- institutional (mid weight — systemic danger to travelers)
  ('law_enforcement_misconduct',  6.0, 'Police Misconduct',           'Police targeting, profiling, or mistreating trans people'),
  ('law_enforcement_failure',     5.0, 'Police Failure to Act',       'Police not investigating or ignoring violence against trans people'),
  ('border_incident',             5.0, 'Border / TSA Incident',       'TSA, CBP, or border crossing issue targeting a trans traveler'),
  ('healthcare_denial',           4.0, 'Healthcare Denial',           'Hospital or clinic refusing care to a trans patient'),
  ('gov_discrimination',          3.0, 'Government Discrimination',   'Government agency denying services based on gender identity'),
  -- climate (lower weight — context signal rather than direct danger)
  ('vigilante',                   4.0, 'Vigilante Confrontation',     'Private citizens confronting, filming, or reporting trans people'),
  ('demonstration',               2.0, 'Anti-Trans Demonstration',    'Organized anti-trans rally or protest'),
  ('political_rhetoric',          1.0, 'Anti-Trans Official Rhetoric','Anti-trans statements by an elected official or law enforcement leader'),
  -- fallback
  ('other',                       2.0, 'Other',                       'Incident not covered by another category');

alter table incident_type_config enable row level security;

create policy "incident_type_config_public_read" on incident_type_config
  for select using (true);

create policy "incident_type_config_admin_write" on incident_type_config
  to authenticated
  using (exists (
    select 1 from profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ));
