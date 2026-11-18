# Better Lift

Mobile-first weightlifting PWA: live workout logging with rest timer and PRs, routines, friends feed with comments and reactions, stats, and Liftoff import.

- **Frontend** — Vite + React + TypeScript + Tailwind v4, deployed to GitHub Pages (`app.<domain>`)
- **Backend** — PocketBase in [`pb/`](pb/) (`api.<domain>`). Server setup: **[pb/README.md](pb/README.md)**

## Run locally (Windows)

```powershell
# terminal 1 – backend (test copy of PocketBase lives in pb\)
powershell -File pb\start-local.ps1
# terminal 2 – frontend
npm install
npm run dev -- --host
```

Open http://localhost:5173. On your phone (same Wi-Fi) use `http://<your-PC-IP>:5173` — the app talks to PocketBase on the same host, port 8090.
Admin dashboard: http://127.0.0.1:8090/_/ — create a local admin with `pb\pocketbase.exe superuser upsert you@example.com <password>`.
Put that login in `.env.development.local` (gitignored, see `.env.example`) so the tests, demo seeding and the in-app `#/admin` dev shortcut (`admin` / `admin`) can use it.

## Tests (need the local backend running)

```powershell
npm run test:api   # every security rule, via the API
npm run test:e2e   # Liftoff import, finishing a workout, PRs, stats
```

## Deploy the app

1. Push to GitHub, then **Settings → Pages → Source: GitHub Actions**.
2. Put your real app domain in `public/CNAME` (currently `app.example.com`) and add a `CNAME` DNS record `app → <you>.github.io`.
3. Add repo variable `VITE_API_URL=https://api.<domain>` (Settings → Secrets and variables → Actions → Variables).
4. Push to `main`; the workflow builds and publishes.

## Credits

The Liftoff CSV importer and stats engine are adapted from [LiftX](https://github.com/JacobG122503/LiftX), and the Stats page layout is modeled on [LiftoffVisualizer](https://github.com/JacobG122503/LiftoffVisualizer), both by JacobG122503 and used with permission.
