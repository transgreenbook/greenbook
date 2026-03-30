# Startup, Stop & Restart Instructions

## After a reboot

Docker starts automatically on boot. The Supabase containers (database, auth, API, studio)
are configured with `unless-stopped` and will restart on their own.

The only thing that needs to be started manually is the Next.js dev server.

### 1. Wait for Supabase to be ready (optional check)

```bash
sudo supabase status
```

All services should show as running. If any are still starting, wait a moment and rerun.

### 2. Start the Next.js dev server

From the project directory (`~/greenbook`):

```bash
npm run dev -- -H 0.0.0.0 &> /tmp/nextjs-dev.log &
```

The `&` runs it in the background. The site will be available at:
- Local:   http://localhost:3000
- Network: http://192.168.50.233:3000

### 3. Confirm it's running

```bash
ss -tlnp | grep 3000
```

You should see a line with `0.0.0.0:3000`.

---

## Stop the website

```bash
pkill -f "next dev"
```

This stops the Next.js dev server. Supabase and Docker keep running.

---

## Restart the website

```bash
pkill -f "next dev"
npm run dev -- -H 0.0.0.0 &> /tmp/nextjs-dev.log &
```

---

## Stop everything (full shutdown)

```bash
pkill -f "next dev"
sudo supabase stop
```

To also stop Docker entirely:

```bash
sudo systemctl stop docker
```

---

## Check dev server logs

```bash
tail -f /tmp/nextjs-dev.log
```

Press `Ctrl+C` to stop following.
