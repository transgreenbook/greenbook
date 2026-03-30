# Root Directory Files

## Required for the app to function

| File | Why |
|---|---|
| `next.config.ts` | Next.js configuration |
| `next-env.d.ts` | TypeScript types for Next.js |
| `package.json` + `package-lock.json` | Dependencies |
| `tsconfig.json` | TypeScript configuration |
| `postcss.config.mjs` | Required for Tailwind CSS |
| `eslint.config.mjs` | Not strictly required, but harmless |
| `docker-compose.yml` | Local Postgres/PostGIS dev database |
| `.env.local` | Environment variables |
| `.gitignore` | Keeps secrets out of git |

## Not required for the website

| File | What it is |
|---|---|
| `LICENSE` | Repo license file |
| `README.md` | Project overview |
