# News Content Studio

Monitor RSS news feeds and turn items into branded social content — image posts,
short template videos, and AI article-to-video productions. See [SPEC.md](./SPEC.md)
for the full product specification and phase plan.

**Current status: Phases 1–4 core complete**

- *Phase 1* — RSS feeds + categories, news inbox with filters, ~30-second polling
  worker with dedupe + conditional GETs, live in-app updates (SSE), browser Web
  Push notifications, admin/editor user management.
- *Phase 2* — full media scraping from feeds (all enclosures/media:content/
  thumbnails/embedded files per item), brand kits (logo upload, colors, font,
  per-brand local/S3 storage), image-post **template designer** (canvas editor,
  three linked sizes 16:9 / 9:16 / 1:1, role-bound text), and a **post composer**
  that fills a template from any inbox item, lets you pick any scraped image or
  upload one, adjust zoom/position, and export full-resolution PNGs per size.
- *Phase 4 (core)* — **article → video**: create a project from any inbox item
  (16:9 or 9:16); AI script generation with an editable prompt (fal.ai any-llm,
  model selectable in Settings — mock mode without keys); scene breakdown with
  per-scene visuals from **article media / SearxNG / Pexels / Pixabay / upload /
  AI image generation** (queries and prompts editable); per-scene **voiceover**
  button (ElevenLabs TTS, mock tone without a key); Ken Burns + fade/cut
  transitions per scene; **music library** (upload or ElevenLabs generation)
  mixed as a bed under narration; worker assembles everything with ffmpeg into
  an H.264 MP4. Admin **Settings** page stores all API keys and model choices.
- *Phase 3* — **short video posts (≤5s)** rendered by ffmpeg in the worker:
  templates carry an editorial kind (breaking/quotes/events/attacks/custom) and
  motion defaults; the composer exports videos per size with Ken Burns motion
  (zoom/pan) on image backgrounds or a looped, cover-cropped **article video**
  background, plus animated text overlays (slide-up/fade). Renders queue in the
  database, process in the worker, and land in the brand's storage as
  H.264 MP4s with live status + download in the composer.

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

## Roadmap (Phase 4 remaining)

- Whisper word-level captions (Hormozi style, any language)
- Brand intro/outro clips and logo watermark on article→video renders
- AI scene animation (fal image-to-video) as an alternative to Ken Burns
- MRSS feeds as scene-footage sources; crop/position editor for scene images
