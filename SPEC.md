# News Content Studio — Product & Technical Specification

A platform for monitoring RSS news feeds and turning news items into branded social
media content: image posts, short (≤5s) template videos, and full AI-generated
article-to-video productions.

Owner: Fadaat Media · Status: **Draft v1 — decisions confirmed, open questions at the end**

---

## 1. Confirmed decisions

| Topic | Decision |
|---|---|
| Stack | Next.js full-stack (App Router) + PostgreSQL + Redis + BullMQ worker |
| Deployment | Docker Compose on a VPS (app, worker, Postgres, Redis, SearxNG) |
| Tenancy | One organization, multiple **brands/companies** (each with its own logo, colors, fonts, intro/outro, defaults) |
| Notifications | In-app real-time (SSE/websocket) + browser Web Push |
| Languages | **Arabic + English**, bilingual from day one: RTL-aware template editor, Arabic fonts, Arabic TTS voices, Arabic word-level captions |
| Image search | Self-hosted **SearxNG** (Docker) with editable search queries |
| Scene video sources | Free stock APIs (Pexels Video, Pixabay Video) + SearxNG video search + **any user-connected MRSS feed** (pluggable source interface) |
| AI provider | **fal.ai** for LLM (script generation), image generation, video generation (scene animation), Whisper transcription; **ElevenLabs or fal** for music; TTS provider per §10 open question |
| Rendering | **ffmpeg** on the worker for final video assembly |
| Delivery | Phased — RSS inbox first (see §9) |

---

## 2. Module: RSS ingestion & news inbox

- **Add feed**: URL + assigned **category** (categories are user-managed: Breaking News,
  Politics, Sports, …), optional brand association, enabled/disabled toggle.
- **Polling worker**: checks every feed on a ~30-second schedule (staggered; honors
  `ETag`/`Last-Modified` conditional GETs so we don't hammer origins). New items are
  deduplicated by GUID/link/content-hash.
- **News inbox**: reverse-chronological stream of items with filters — by feed, category,
  read/unread, date range, keyword search. Item view shows title, summary/full text,
  media (images from `enclosure`/`media:content`), source, publish time.
- **Notifications**: on new item(s) → in-app toast + unread badge + Web Push
  (works with the tab closed). Per-feed and per-category notification mute controls.
- From any inbox item, the user launches: **Image Post**, **Short Video (≤5s)**, or
  **Article → Video**.

## 3. Module: Brands (companies)

Each brand holds the identity used by all templates and renders:

- Logo(s) (light/dark variants), color palette, fonts (Arabic + Latin).
- Default logo **position/size per template** (overridable per template).
- Video **intro** and **outro** clips/slates (per aspect ratio).
- Default TTS voice, default caption style, default music preferences.

## 4. Module: Image post studio (trending social templates)

- **Template designer**: canvas editor (Konva.js) with layers — background image slot,
  headline text box, secondary text, logo slot, category ribbon (e.g. "عاجل / BREAKING"),
  social-platform badges/handles, date/source line, shapes/overlays/gradients.
  Full RTL text support with Arabic-capable fonts.
- Every element stores position, size, rotation, z-order, font, color, alignment,
  max-lines/auto-shrink rules.
- **Multi-size variants**: one template defines up to three linked size variants —
  **landscape (16:9)**, **vertical (9:16 / 4:5)**, and **square (1:1)** — each with its own
  layout of the same elements.
- **Compose flow**: pick news item → pick template → text auto-filled from the item
  (editable) → choose/upload/crop background image → export PNG/JPG in any or all sizes.
- Templates are saved, versioned, duplicated, and tagged by category/brand.

## 5. Module: Short video posts (≤ 5 seconds)

- **Video template designer**: animated variants of image templates — background
  (image with motion, or looping video), animated headline in/out, logo, category style.
- Template kinds by editorial type: **Breaking News, Quotes, Happening/Events, Attacks,
  …** (user-defined list, each with its own look/sound cue).
- Same multi-size model (16:9 / 9:16 / 1:1). Rendered by the worker with ffmpeg;
  output MP4 (H.264 + AAC).

## 6. Module: Article → Video pipeline

End-to-end flow for turning an article into a narrated video:

1. **Select article** from inbox → choose **video template** (16:9 or 9:16) and brand.
2. **Script generation**: fal.ai LLM (GPT-class model) writes a narration script and
   splits it into **scenes** following video best practices (hook first, one idea per
   scene, short sentences). The user can view/edit the prompt before generating, and
   edit the resulting script/scenes.
3. **Per-scene visuals** — each scene gets an image/video, sourced by (in priority order,
   all user-switchable per scene):
   - **SearxNG image search** (auto query from scene text; query is editable);
   - **stock video / MRSS sources** (Pexels, Pixabay, any connected MRSS feed);
   - **AI image generation** via fal (prompt shown and editable before generating);
   - **manual upload** with position/crop adjustment.
4. **Scene animation**: per scene choose **Ken Burns** (pan/zoom presets, done in ffmpeg)
   or **AI animation** (fal image-to-video model).
5. **Per-scene TTS**: a "Generate voiceover" button per scene; regenerate individually.
   Scene duration derives from its audio length.
6. **Transitions**: selectable transition between each pair of scenes
   (cut, crossfade, slide, zoom, glitch…), with a template-level default.
7. **Intro / outro**: from the brand + template settings; logo watermark position/size
   per template per brand.
8. **Captions**: Whisper (via fal) produces word-level timestamps in any language →
   **Hormozi-style animated captions** (word-by-word pop, emphasis colors, keyword
   highlighting), RTL-aware for Arabic. Caption style is configurable and saved as
   presets.
9. **Music**: pick from the Music Library (§7); auto-duck under voiceover.
10. **Render**: BullMQ job → ffmpeg assembles intro + scenes (visual + Ken Burns/AI
    motion + transitions) + TTS track + music + burned-in captions + outro → MP4.
    Progress shown live; result saved to the media library with re-render support.

## 7. Module: Music library

- **Generate** music via ElevenLabs Music or fal music models (prompt + duration).
- **Upload** own tracks.
- **Library** of all generated/uploaded pieces: preview, tag, favorite, reuse.

## 8. Architecture

```
docker-compose:
  web      → Next.js (UI + API routes; SSE for realtime)
  worker   → Node worker (BullMQ): feed polling, TTS/image/video jobs, ffmpeg renders, Whisper
  postgres → data
  redis    → queues + pub/sub
  searxng  → self-hosted image/video metasearch
  storage  → local volume (S3-compatible/MinIO optional later)
```

- All AI calls (LLM, image, video, Whisper) go through a thin provider layer so models
  can be swapped; fal.ai is the default backend.
- Media (uploads, generated assets, renders) stored on a mounted volume, served by the app.
- Auth: NextAuth (credentials to start), single organization, role field for later use.

### Core data model (sketch)

`Brand` · `Feed` (url, category, brand?, etag/lastModified) · `Category` ·
`NewsItem` (feed, guid, title, content, media, publishedAt, readAt) ·
`ImageTemplate` (+ `TemplateVariant` per size, element JSON) ·
`VideoTemplate` (kind, aspect, intro/outro refs, caption preset, transition default) ·
`VideoProject` (article, template, brand, status) · `Scene` (order, text, visual source +
asset, animation, tts audio, transition-out) · `MusicTrack` · `MediaAsset` ·
`CaptionPreset` · `NotificationSubscription` (web push)

## 9. Delivery phases

1. **Phase 1 — RSS core**: feeds + categories + 30s polling worker + inbox with filters +
   in-app & Web Push notifications. *(verifiable end-to-end on its own)*
2. **Phase 2 — Image post studio**: brand kits, template designer with multi-size
   variants, compose & export from a news item.
3. **Phase 3 — Short videos (≤5s)**: video template designer, ffmpeg render worker.
4. **Phase 4 — Article → Video**: script/scenes, SearxNG + stock + MRSS + AI visuals,
   TTS, Ken Burns/AI animation, transitions, Whisper captions, music library, final render.

## 10. Open questions (to confirm)

1. **TTS provider**: the brief says fal.ai for TTS, but ElevenLabs (already used for
   music) has notably better **Arabic** voices. Proposal: ElevenLabs as default TTS,
   fal as fallback. OK?
2. **API keys**: fal.ai and ElevenLabs keys will be supplied via environment variables —
   do you already have both accounts?
3. **Article-to-video length**: cap the narrated video (e.g. 60–90s ≈ 6–10 scenes)?
4. **Feed scale**: roughly how many feeds will run at once? (Affects polling fan-out; the
   design targets ~100 feeds comfortably.)
5. **Caption look**: any reference video for the exact Hormozi caption style you want
   (colors, emoji, box vs. plain)? Styles are presets, so we just need the first one.
6. **Image post export**: client-side canvas export (instant, per-user browser) is the
   default; is server-side batch export needed too?
7. **Storage**: local disk volume is the Phase-1 default; want S3/MinIO from the start?
8. **Access**: how many team members initially, and do you need roles (admin/editor) in
   v1 or is a shared login acceptable?
