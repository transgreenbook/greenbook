create table incidents (
  id                serial primary key,
  title             text not null,
  description       text,
  incident_date     date,
  incident_type     text check (incident_type in ('assault','murder','sexual_assault','harassment','property','other')),
  jurisdiction_type text check (jurisdiction_type in ('federal','state','county','city','reservation','territory')),
  geom              geometry(Point, 4326),
  city              text,
  county_name       text,
  state_abbr        character(2),
  state_id          integer references states(id),
  county_id         integer references counties(id),
  city_id           integer references cities(id),
  reservation_id    integer references reservations(id),
  source_url        text,
  source_name       text,
  digest_run_id     integer references digest_runs(id) on delete set null,
  digest_finding_id integer references digest_findings(id) on delete set null,
  confidence        numeric(3,2),
  reviewed_at       timestamptz,
  approved_at       timestamptz,
  dismissed_at      timestamptz,
  reviewer_notes    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_incidents_geom      on incidents using gist (geom);
create index idx_incidents_date      on incidents (incident_date);
create index idx_incidents_state_id  on incidents (state_id);
create index idx_incidents_type      on incidents (incident_type);
create index idx_incidents_approved  on incidents (approved_at);

create trigger trg_incidents_updated_at
  before update on incidents
  for each row execute function set_updated_at();

alter table incidents enable row level security;

create policy "incidents_admin_write" on incidents
  to authenticated
  using (exists (
    select 1 from profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ));

create policy "incidents_public_read" on incidents
  for select using (approved_at is not null);
