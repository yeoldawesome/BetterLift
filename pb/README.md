# Better Lift — backend (PocketBase)

This folder is everything the server needs. Copy **`pb_migrations/`**, **`pb_hooks/`** and **`deploy/`** to your server; nothing else is required.
(`pocketbase.exe` and `pb_data/` here are only the local Windows test copy — don't upload them.)

| Folder | What it does |
|---|---|
| `pb_migrations/` | Creates all tables, security rules and the ~90 built-in exercises. Runs automatically on first start. |
| `pb_hooks/` | Server logic: computes estimated 1RM for PRs, blocks writing to someone else's workout, friend-only comments, exercise review. |
| `deploy/` | Example `systemd` service and Caddy config. |

## Install on a Linux server (Ubuntu/Debian)

Assumes a domain like `example.com`, with the app at `app.example.com` (GitHub Pages) and the API at `api.example.com` (this server).

**1. DNS** — add an `A` record: `api.example.com → <your server IP>`.

**2. Download PocketBase** (v0.40 or newer — check https://github.com/pocketbase/pocketbase/releases for the latest):
```sh
sudo mkdir -p /opt/betterlift && cd /opt/betterlift
sudo curl -LO https://github.com/pocketbase/pocketbase/releases/download/v0.40.6/pocketbase_0.40.6_linux_amd64.zip
sudo unzip pocketbase_0.40.6_linux_amd64.zip pocketbase && sudo rm pocketbase_*.zip
```

**3. Upload this folder's contents** (run on your own computer, from the `BetterLift` folder):
```sh
scp -r pb/pb_migrations pb/pb_hooks pb/deploy you@your-server:/tmp/
# then on the server:
sudo mv /tmp/pb_migrations /tmp/pb_hooks /opt/betterlift/
```

**4. Create your admin account:**
```sh
cd /opt/betterlift && sudo ./pocketbase superuser upsert you@example.com 'a-long-password'
```

**5. Run it as a service** (starts on boot, restarts on crash):
```sh
sudo useradd --system --home /opt/betterlift betterlift
sudo chown -R betterlift:betterlift /opt/betterlift
sudo cp /tmp/deploy/betterlift-pb.service /etc/systemd/system/
sudo nano /etc/systemd/system/betterlift-pb.service   # change app.example.com to your app domain
sudo systemctl daemon-reload && sudo systemctl enable --now betterlift-pb
```

**6. HTTPS with Caddy** (free automatic certificates):
```sh
sudo apt install -y caddy
sudo cp /tmp/deploy/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile                         # change api.example.com
sudo systemctl reload caddy
```

**7. Check it:** open `https://api.example.com/api/health` (should say "API is healthy") and `https://api.example.com/_/` (admin dashboard).

**8. Point the app at it:** in GitHub → repo **Settings → Secrets and variables → Actions → Variables**, add `VITE_API_URL = https://api.example.com`, then re-run the Deploy workflow.

**9. Recommended in the dashboard (`/_/` → Settings):**
- *Mail settings* — add SMTP so password-reset emails work.
- *Backups* — turn on scheduled backups.

## Moderators (exercise review)

Users can submit custom exercises to become official. To let someone review them: dashboard (`/_/`) → **users** → open the user → turn on **is_moderator** → Save. They'll see **Profile → Review exercises** next time they open the app. Approving makes the exercise official for everyone and credits the submitter; rejecting keeps it as their private custom exercise with your note. Users can't make themselves moderators.

## Updating later
Copy new files into `pb_migrations/` / `pb_hooks/`, then `sudo systemctl restart betterlift-pb`. New migrations apply automatically; existing data is kept.

## Testing against a server
From the `BetterLift` folder: `node scripts/smoke.mjs https://api.example.com` — creates a few throwaway `*_test.local` users and checks every security rule. Delete them afterwards in the dashboard.
