#!/usr/bin/env bash
# seed-admin.sh
#
# Creates a local dev admin user in the running Supabase instance.
# Reads ADMIN_EMAIL and ADMIN_PASSWORD from .env.local, or prompts
# if they are not set.
#
# Usage:
#   bash scripts/seed-admin.sh
#
# Prerequisites: local Supabase must be running (supabase start / docker compose up)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT/.env.local"
DB_CONTAINER="supabase_db_greenbook"
DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

# ---------------------------------------------------------------------------
# Load .env.local
# ---------------------------------------------------------------------------
if [[ -f "$ENV_FILE" ]]; then
  # Append a newline so `read` doesn't silently drop the last line
  while IFS= read -r line || [[ -n "$line" ]]; do
    trimmed="${line#"${line%%[![:space:]]*}"}"
    [[ -z "$trimmed" || "$trimmed" == \#* ]] && continue
    [[ "$trimmed" != *=* ]] && continue
    key="${trimmed%%=*}"
    val="${trimmed#*=}"
    val="${val%%[[:space:]]#*}"   # strip trailing inline comments
    [[ -z "${!key+x}" ]] && export "$key"="$val"
  done < "$ENV_FILE"
fi

# ---------------------------------------------------------------------------
# Resolve credentials
# ---------------------------------------------------------------------------
EMAIL="${ADMIN_EMAIL:-}"
PASSWORD="${ADMIN_PASSWORD:-}"

if [[ -z "$EMAIL" ]]; then
  read -rp "Admin email: " EMAIL
fi
if [[ -z "$PASSWORD" ]]; then
  read -rsp "Admin password: " PASSWORD
  echo
fi

if [[ -z "$EMAIL" || -z "$PASSWORD" ]]; then
  echo "Error: email and password are required." >&2
  exit 1
fi

echo "Creating admin user: $EMAIL"

# ---------------------------------------------------------------------------
# Insert user + profile via psql in the Supabase container
# ---------------------------------------------------------------------------
docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres <<SQL
DO \$\$
DECLARE
  uid uuid;
BEGIN
  -- Check if user already exists
  SELECT id INTO uid FROM auth.users WHERE email = '$EMAIL';

  IF uid IS NULL THEN
    -- Create the auth user with a bcrypt-hashed password
    INSERT INTO auth.users (
      id,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      aud,
      role
    ) VALUES (
      gen_random_uuid(),
      '$EMAIL',
      crypt('$PASSWORD', gen_salt('bf')),
      now(),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{}',
      'authenticated',
      'authenticated'
    )
    RETURNING id INTO uid;

    RAISE NOTICE 'Created auth user with id=%', uid;
  ELSE
    -- User exists — update password and ensure confirmed
    UPDATE auth.users
    SET encrypted_password  = crypt('$PASSWORD', gen_salt('bf')),
        email_confirmed_at  = COALESCE(email_confirmed_at, now()),
        updated_at          = now()
    WHERE id = uid;

    RAISE NOTICE 'Updated existing user with id=%', uid;
  END IF;

  -- Upsert profile with admin role
  INSERT INTO public.profiles (id, role)
  VALUES (uid, 'admin')
  ON CONFLICT (id) DO UPDATE SET role = 'admin';

  RAISE NOTICE 'Profile set to admin for id=%', uid;
END;
\$\$;
SQL

echo "Done. You can now log in at http://127.0.0.1:3000/login with $EMAIL"
