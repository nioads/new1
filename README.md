# News Content Studio

Monitor RSS news feeds and turn items into branded social content — image posts,
short template videos, and AI article-to-video productions. See [SPEC.md](./SPEC.md)
for the full product specification and phase plan.

**Current status: Phases 1–2 complete**

- *Phase 1* — RSS feeds + categories, news inbox with filters, ~30-second polling
  worker with dedupe + conditional GETs, live in-app updates (SSE), browser Web
  Push notifications, admin/editor user management.
- *Phase 2* — full media scraping from feeds (all enclosures/media:content/
  thumbnails/embedded files per item), brand kits (logo upload, colors, font,
  per-brand local/S3 storage), image-post **template designer** (canvas editor,
  three linked sizes 16:9 / 9:16 / 1:1, role-bound text), and a **post composer**
  that fills a template from any inbox item, lets you pick any scraped image or
  upload one, adjust zoom/position, and export full-resolution PNGs per size.

## Stack

Next.js 15 (App Router) · PostgreSQL + Prisma 7 · NextAuth v5 (credentials,
admin/editor roles) · standalone Node polling worker · Tailwind CSS 4 ·
Docker Compose (web, worker, postgres, redis, searxng).

## Quick start (Docker — works on Windows, macOS, Linux)

```bash
git clone https://github.com/nioads/new1.git
cd new1
git checkout claude/rss-news-social-templates-mnmiwy
docker compose up --build
```

No environment setup needed for a first run. Open http://localhost:3000 —
default login `admin@example.com` / `admin1234`.

For **production**, always override the dev defaults:

```bash
AUTH_SECRET=$(openssl rand -base64 32) \
SEED_ADMIN_PASSWORD=your-strong-password \
docker compose up --build -d
```

To enable **browser push notifications**, generate keys with
`npx web-push generate-vapid-keys` and set `VAPID_PUBLIC_KEY` /
`VAPID_PRIVATE_KEY` before starting.

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

- **Phase 3** — ≤5s video templates (breaking/quotes/events/…) rendered with ffmpeg
- **Phase 4** — article → video: AI script/scenes, SearxNG/stock/MRSS visuals,
  ElevenLabs TTS, Whisper captions (Hormozi style), music library, up-to-30-min renders
