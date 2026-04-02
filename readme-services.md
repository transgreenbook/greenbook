# Service Management

The TransGreenbook Next.js dev server runs as a user systemd service (`greenbook.service`). It starts automatically on boot and stays running whether or not anyone is logged in.

## Prerequisites

`loginctl enable-linger` must be run once per machine to allow user services to persist after logout:

```bash
sudo loginctl enable-linger cdlucas
```

This is persistent — it does not need to be re-run after a reboot.

## Common commands

**Start / stop / restart the server:**
```bash
systemctl --user start greenbook.service
systemctl --user stop greenbook.service
systemctl --user restart greenbook.service
```

**Check status:**
```bash
systemctl --user status greenbook.service
```

**Follow live logs:**
```bash
journalctl --user -u greenbook.service -f
```

**View recent logs:**
```bash
journalctl --user -u greenbook.service --since "1 hour ago"
```

## Service file location

```
~/.config/systemd/user/greenbook.service
```

After editing the service file, reload the daemon before restarting:

```bash
systemctl --user daemon-reload
systemctl --user restart greenbook.service
```

## Supabase

Supabase runs as Docker containers and starts automatically via the Docker systemd service on boot. The `greenbook.service` unit declares `After=docker.service` so it waits for Docker before starting.

If any Supabase containers fail to start, the service's `ExecStartPre` step will restart them automatically before the Next.js server launches.
