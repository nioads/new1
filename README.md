# News Content Studio

Monitor RSS news feeds and turn items into branded social content — image posts,
short template videos, and AI article-to-video productions. See [SPEC.md](./SPEC.md)
for the full product specification and phase plan.

**Current status: Phase 1 complete** — RSS feeds + categories, news inbox with
filters, ~30-second polling worker with dedupe + conditional GETs, live in-app
updates (SSE), browser Web Push notifications, and admin/editor user management.

## Stack

Next.js 15 (App Router) · PostgreSQL + Prisma 7 · NextAuth v5 (credentials,
admin/editor roles) · standalone Node polling worker · Tailwind CSS 4 ·
Docker Compose (web, worker, postgres, redis, searxng).

## Quick start (Docker)

```bash
cp app/.env.example app/.env       # reference for variables
export AUTH_SECRET=$(openssl rand -base64 32)
# optional but recommended — enables browser push notifications:
# npx web-push generate-vapid-keys   → export VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
docker compose up --build
```

Open http://localhost:3000 — default login `admin@example.com` / `admin1234`
(override with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`; change it immediately).

## Local development

```bash
cd app
npm install
# Postgres must be running; set DATABASE_URL in app/.env
npx prisma migrate dev
npm run db:seed
npm run dev        # web on :3000
npm run worker     # feed poller (separate terminal)
```

## How Phase 1 works

- **Feeds** are added with a category (and optional brand). The URL is validated
  by fetching and parsing it before it's saved.
- The **worker** ticks every 5s and polls each enabled feed that hasn't been
  checked in the last 30s (staggered, max 10 concurrent). It sends
  `If-None-Match`/`If-Modified-Since` headers so unchanged feeds cost almost
  nothing, dedupes items by GUID per feed, and backs off failing feeds.
- New items appear in the **inbox** instantly via a server-sent-events stream,
  and are pushed to subscribed browsers via **Web Push** (unless the feed or
  its category is muted).
- **Roles**: admins manage users; editors manage feeds, categories, and content.

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `AUTH_SECRET` | NextAuth JWT secret |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push (generate with `npx web-push generate-vapid-keys`) |
| `POLL_INTERVAL_MS` | Feed polling interval (default 30000) |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Initial admin account |

## Roadmap

- **Phase 2** — brand kits + image-post template designer (multi-size export)
- **Phase 3** — ≤5s video templates (breaking/quotes/events/…) rendered with ffmpeg
- **Phase 4** — article → video: AI script/scenes, SearxNG/stock/MRSS visuals,
  ElevenLabs TTS, Whisper captions (Hormozi style), music library, up-to-30-min renders
