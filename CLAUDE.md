# Better Lift — notes for Claude

Mobile-first weightlifting PWA. Vite + React 19 + TypeScript + Tailwind v4 frontend, PocketBase backend in `pb/`.

## Layout
- `src/screens/` — one file per route (routes in `src/App.tsx`, hash router).
  - `Workout.tsx` — live workout: `ActiveWorkout`, `ExerciseBlock` (⋮ menu: reorder, note, superset, replace, remove; tap set number → set type sheet), `FinishSheet`.
  - `Feed.tsx` + `components/WorkoutCard.tsx` — feed cards (body map panel, reactions cluster bottom-left, comment button with red count badge, 🙂 reaction picker).
  - `Stats.tsx` — Lifting | Physique toggle; `Physique.tsx` = body metrics (RENPHO CSV import via `lib/body.ts`, `body_metrics` collection).
  - `Profile.tsx` — hero header, streak card, emoji shortcut grid, `Memories` (2-week calendar), `TotalCard` (duration/volume chart with range menu).
  - `WorkoutDetail.tsx`, `WorkoutEdit.tsx` — finished workout view/edit (carry set_type/note/superset through).
- `src/lib/active.tsx` — active workout state (localStorage `bl.active`), `finishWorkout`, routine sync. Types `AEx` (note?, superset?), `ASet` (type?).
- `src/lib/setTypes.ts` — set types (W/1/F/D/C) and `setLabels`.
- `src/lib/pb.ts` — PocketBase client + record types. `src/lib/format.ts` — unit/format helpers.
- `src/components/ui.tsx` — `Card`, `Button`, `Sheet` (full screen), `BottomSheet` (slide-up menu), etc. Icons in `components/icons.tsx`.
- `pb/pb_migrations/` — numbered JS migrations (latest: `1731800017_body_metrics.js`). New schema = new migration file.

## Conventions
- Colours via theme tokens: `bg-surface`, `bg-surface-2`, `text-muted`, `text-faint`, `text-accent`, `bg-accent`, `text-danger`, `border-line`. Superset badge: `bg-red-600`.
- Weights stored in kg, shown in user unit (`fmtW`, `fromUnit`). Warm-up/cool-down sets never count toward PRs (e1rm 0).
- Superset group: string id in active state, small int per workout in `workout_sets.superset`. Exercise note stored on first set row.
- Keep edits minimal; no refactors/comments on untouched code. Typecheck with `npx tsc -b`.

## Local testing (cloud container)
- No PocketBase binary in repo. Download `pocketbase_0.40.6_linux_amd64.zip` (URL in `pb/README.md`) to the scratchpad, then
  `pocketbase serve --http 127.0.0.1:8090 --dir <scratch>/pbdata --migrationsDir pb/pb_migrations --hooksDir pb/pb_hooks`.
- Superuser: `pocketbase superuser upsert <email> <pw> --dir ...`; seed with `PB_ADMIN_EMAIL=.. PB_ADMIN_PASSWORD=.. node scripts/seed-demo.mjs`.
  Demo login: `alex_lifts@demo.betterlift.local` / `demo12345`.
- Frontend: `npx vite --port 5173` (talks to `:8090` on same host). Playwright is preinstalled; scripts must be CommonJS (`.cjs`).

## Working with the user
- Terse answers. Commit + push to the session branch after each feature.
- Screenshots: take checking screenshots at deviceScaleFactor 1; only send the user screenshots when asked.
