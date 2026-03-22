# PRD for an Advanced Content Engine for Social Video Generation, Avatars, Music Videos, and Long-to-Shorts

## Product vision and goals

## Document metadata (living PRD)
- **Owner:** All Content (Product + Engineering)
- **Status:** Draft v0.1 (initial deep-research baseline)
- **Last updated:** 22 March 2026 (Asia/Qatar)
- **Change process:** Every new feature/constraint we agree will be added under “Scope changes” within this PRD, and reflected in the relevant requirement sections (functional + non-functional).

## Vision
Build a unified “Content Engine” that can ingest trending/viral topics (text, URLs, RSS), automatically generate multiple types of social-native videos (news-style, avatar-led, music video variants, shorts cutdowns), and then provide professional editing, asset management, and multi-platform publishing/scheduling in one platform.

## Primary goals
Create high-quality short-form video content quickly and consistently, with strong “hook-first” storytelling, character/brand consistency across scenes, and platform-ready variants (9:16 and 16:9). Video generation backends must be modular so we can route jobs to different vendors/models (e.g., OpenAI Sora 2, Google Veo on Vertex AI / Gemini API) based on cost, quality, throughput, and feature availability.

## Key external capabilities we can leverage (research-backed)
- **Sora 2** is available via the OpenAI API as a video generation model supporting portrait (720×1280) and landscape (1280×720) outputs, generating video with synced audio; generation is asynchronous and supports polling or webhooks.
- **Google Veo** is available via Vertex AI video generation APIs (and via Gemini API), supports text-to-video and image-to-video, provides multiple model variants (including Veo 3.x series) and supports multiple resolutions/aspect ratios (including 16:9 and 9:16).
- **ElevenLabs** provides APIs for TTS, music generation (“Eleven Music”), and sound effects; credits/pricing is model-based and the platform positions these as dedicated capabilities.
- **Google Cloud Text-to-Speech** supports text or SSML input, letting us control pauses and pronunciation for better narration control.

## Non-goals (initially)
Feature-film length generation, fully custom 3D animation pipelines, and bespoke human-on-human collaboration tools as deep as Adobe Premiere / After Effects. (We can still offer “advanced” editing for social workflows, but the product is not trying to replace full post-production suites on day one.)

## Success definition (initial)
A user can go from “topic input → 5 platform-ready videos → scheduled across multiple accounts” within one workflow, with predictable quality, clear revision controls, and a measurable reduction in time-to-publish versus manual creation.

## Users, personas and end-to-end journeys

### Primary personas
- **Creator/Influencer:** wants fast, consistent output; cares about hooks, subtitles, and style consistency.
- **Publisher/News Page Operator:** wants daily/weekly “viral topic news videos” from feeds/URLs and needs basic sourcing, fast turnaround, and safety controls.
- **Social Media Manager/Agency:** manages multiple brands/accounts; demands a planner, approvals, and scalable batch workflows.
- **Editor/QA:** needs timeline control, captions, and the ability to fix issues without regenerating everything.

### Core journeys mapped to your four product pillars
- **News video generation:** user selects time window (e.g., “last 24h”, “weekly recap”), provides RSS/URL/text input, chooses a template/style, and generates a hook-led news video with consistent characters and scene logic, then edits and publishes.
- **Avatar content:** user chooses a viral topic + selects 5 user-created avatars; engine generates 5 avatar videos in parallel with voice + lip sync, exporting 9:16 and 16:9 variants.
- **Music video variants:** user provides a track/lyrics; engine generates 5 stylistically aligned videos (AI-generated footage and/or Pexels-based stock), aligned to timing/sections, in both aspect ratios. Pexels content is free for commercial use under the Pexels licence (with caveats around depicted trademarks/rights), and Pexels also offers an API for searching photos/videos.
- **Long-to-shorts:** user uploads a long-form video or provides a YouTube link; engine creates multiple short clips with metadata (title, thumbnail, description, comma-separated tags) and optional auto-captions (e.g., WebVTT). WebVTT is a W3C format for time-aligned captions/subtitles.

## Scope and functional requirements
This section defines the minimum shippable system and the advanced capabilities you explicitly requested. Requirements are written so we can keep updating them as we decide details (video length rules, styles, SLAs, etc.).

### Ingestion, topic selection, and knowledge inputs
- The system shall accept three primary topic inputs: raw text, a URL, or RSS feeds.
- For URL inputs, the system shall fetch and extract the main article body, plus metadata (title, publisher, publish date) for citation/attribution and later on-screen overlays.
- For RSS inputs, the system shall allow users to select sources, apply filters (keywords/language/region), and choose a configurable “timing window” that we will define (e.g., past N hours/days).
- The system shall optionally support “viral topic discovery” by ranking candidate topics using signals such as cross-source mention frequency, recency, and engagement proxies (where available). (Implementation details are flexible; requirement is outcome-driven.)

### Script generation, hook creation, and scene planning
- For news videos, the engine shall generate a short “hook” opening (first seconds) followed by a structured narrative (context → key points → implications → CTA/follow).
- The engine shall automatically break the script into scenes, each with: a scene goal, duration budget, on-screen text (if any), required characters, setting, action, and a visual style directive.
- The system shall maintain a Story Consistency Graph (internal representation) linking: entities (people/brands/places), character identities, timeline order, and scene-to-scene continuity rules (e.g., same outfit/face/props across adjacent scenes unless intentionally changed).

### Character, style, and brand systems
- The platform shall provide a **Character Library** (e.g., anchors, correspondents, recurring characters) with canonical metadata: name, role, voice profile, visual references, and usage permissions.
- A **Style Library** (photo/illustration/cinematic/3D/anime, etc.) with constraints per platform (e.g., “max text density”, “safe margins”, “subtitle fonts”, “brand colours”).
- A **Brand Kit** per workspace/account: logo, watermark rules, intro/outro, typography, colour palette, and banned content rules.

### Character consistency options (deep research constraint/enablement)
- If using OpenAI Sora 2, the system shall support a “character reference” workflow where available. OpenAI’s Sora 2 prompting guide describes a characters option that can reference uploaded character IDs (up to two) via a Characters API.
- If using Google Veo, the system shall support reference-image guided generation to preserve a subject’s appearance. Google’s Veo documentation describes using reference images to match a provided subject, and the Veo 3.1 prompting guidance explicitly discusses directing scenes with consistent characters and styles.

### Audio pipeline: narration, voices, dubbing, music, and sound
#### Narration (TTS)
The system shall generate narration using either:
- Google Cloud Text-to-Speech (for broad language/voice coverage and SSML-based control), or
- ElevenLabs TTS (for premium voice realism and brand voice consistency, depending on the chosen model).

Google TTS supports SSML to customise pauses and formatting; Cloud TTS converts text/SSML to audio.

#### Music generation
The system shall generate background music that matches the video’s mood and pacing using ElevenLabs “Eleven Music” (text-to-music). ElevenLabs documents Eleven Music as a text-to-music model, and provides a “compose music” API endpoint for generation.

For music videos, the system shall support timed composition control (e.g., sections/structure). ElevenLabs’ music quickstart notes that music generation can produce a composition plan and optionally return it for detailed control.

#### Sound effects
The system shall optionally generate Foley/ambient SFX via ElevenLabs Sound Effects endpoints. ElevenLabs documents text-to-sound-effects as a capability and provides API conversion endpoints.

#### Dubbing (future expansion that complements long-to-shorts)
The platform should be designed to optionally support language dubbing for generated and uploaded videos. ElevenLabs documents dubbing as translating audio/video while preserving emotion and timing, and provides a dubbing API to dub a provided audio/video file.

### Visual generation and animation pipeline
#### Scene imagery
- The system shall generate images for each scene according to the scene plan (style, location, action, characters).
- The system shall maintain “visual continuity” by reusing reference assets (character refs, palettes, wardrobe notes) and capturing prompt lineage for each asset.

#### Animating images into video
The system shall support multiple video generation backends via a unified adapter interface. Initially supported backends:
- **OpenAI Sora 2:** supports text and image inputs and outputs video with synced audio; Sora video generation is asynchronous, returning a job object that can be polled or tracked via webhooks.
- **Google Veo:** supports generating video from text or image prompts, has multiple supported models (including Veo 3.x), and can generate videos at various resolutions/aspect ratios.

#### Aspect ratio outputs
The system shall natively support 9:16 (portrait) and 16:9 (landscape) generation/export. This aligns with Sora 2’s documented portrait/landscape outputs and Veo’s documented 9:16 / 16:9 support in its Vertex AI overview.

### Avatar content: 5 parallel videos with user avatars
#### User avatar creation and management
- Users shall be able to create and store avatar profiles (visual persona + voice settings + permissions).
- Voice for avatars shall be generated using ElevenLabs voices (per-user selected voices or cloned voices, subject to compliance rules we define).

#### Lip-sync / talking-avatar generation (API-driven)
The system shall integrate with one (or more) lip-sync APIs, abstracted behind a vendor layer to avoid lock-in. Viable researched options include:
- **HeyGen API:** documentation describes creating Photo Avatars/Digital Twins and generating videos using an avatar_id.
- **D-ID API:** positions a “single image → talking head video” workflow and supports voice selection / TTS integration.

(We will choose one as the default and keep others as fallback/enterprise options.)

#### Parallelisation requirement
For a single topic input, the system shall produce 5 avatar videos concurrently, each with:
- a distinct avatar (user-chosen),
- consistent script adaptation (same factual spine, different delivery/personality if desired),
- exports in both portrait and landscape.

### Music video generator: 5 variants, AI or Pexels-based
#### Inputs
User provides: music track (audio file) + lyrics (optional but recommended) + target style (mood/genre/visual language) + desired timestamps (optional).

#### Variant generation
The system shall generate 5 distinct music video variants per request, in both aspect ratios.

#### Footage sourcing mode
- **Mode A:** AI-generated visuals (image/video generation pipelines).
- **Mode B:** Stock-based visuals from Pexels API. Pexels offers a free image/video API and a default rate limit (documented as 200 requests/hour and 20,000/month, with an application process for removing limits).

Pexels content is free for commercial use under its licence guidance, while still warning that depicted trademarks/logos/brands may be protected and require additional rights.

#### Timing alignment
The system shall align cuts/scene changes to the music timeline (beats/sections) and align on-screen lyrics captions (if provided).

### Long to shorts via AI: upload/link → clips + metadata
#### Inputs
- **Upload:** user uploads a long-form video file, or
- **Link:** user provides a YouTube URL (and confirms they have the rights to process it).

#### Outputs
The system shall output a set of short clips suitable for vertical-first platforms, each with:
- auto-generated title,
- thumbnail,
- description,
- comma-separated tags,
- captions/subtitles export (e.g., WebVTT).

WebVTT is explicitly designed for time-aligned captions/subtitles and other timed metadata.

#### YouTube constraints awareness (for Shorts packaging)
The system shall include a “YouTube Shorts preset” aware that YouTube supports Shorts up to three minutes for qualifying vertical/square uploads (per YouTube Help).

### Advanced editing capabilities: timeline-first, social-native
Editing is a core differentiator: the platform must not be “generate and hope”. It must let users finish content professionally.

#### Timeline editing
The editor shall support at minimum:
- multi-track video/audio timeline,
- clip trimming/splitting, ripple edits, snapping, and markers,
- transitions, zooms, pans, motion presets,
- text overlays, lower thirds, progress bars, stickers, and safe-area guides,
- caption editing (including per-word highlighting style presets),
- audio mixing (ducking music under narration, normalisation, fades).

#### Rendering engine
The platform shall implement a deterministic render pipeline (template → timeline → exported mp4/mov) using a robust media processing layer. FFmpeg’s filtergraph system supports multi-input/multi-output filtering and compositing patterns such as split/crop/overlay, which is well-suited to programmatic timeline rendering.

#### Export presets
The system shall export:
- 9:16 and 16:9,
- platform presets (bitrate, caption safe margins, loudness targets),
- optional burned-in captions and/or sidecar caption files (e.g., WebVTT).

### Asset storage, lineage, and re-use
The system shall store all assets generated/used:
- scripts & scene plans,
- prompt/parameter lineage,
- images, videos, audio stems (narration, music, SFX),
- project templates and edit timelines,
- rights/licence metadata (especially for stock).

This is required for:
- revisions without regenerating everything,
- audit/compliance,
- re-using characters/styles across a series.

### Multi-platform publishing and planner
#### Planner
The platform shall include:
- a calendar planner (per brand/account),
- content queues,
- approval states (Draft → Review → Approved → Scheduled → Published),
- bulk scheduling and “posting windows”,
- campaign tagging and series support.

#### Publishing connectors (researched API realities)
- **YouTube:** YouTube Data API supports video uploads (videos.insert) and updates; scheduling can be done via status.publishAt but requires the video’s privacyStatus to be private and the video must not have been published before.
- **YouTube authentication:** insert/update/delete requests require authorisation (OAuth 2.0), as described in the API reference.
- **TikTok:** TikTok’s Content Posting APIs support uploading and posting content; the docs describe initializing upload and transferring content, and also positioning the API for direct posting or uploading as a draft for further editing.
- **LinkedIn:** LinkedIn’s UGC Post creation with video requires uploading a video asset first to obtain a URN, and LinkedIn’s newer Videos API includes captions-file upload and thumbnail functionality.
- **Instagram (publishing constraints surfaced via Meta sample):** Meta’s official sample for Instagram Reels Publishing APIs states the IG Content Publishing API is limited to Business accounts connected to a Facebook Page, includes Reels media requirements, and notes a publishing rate limit of 25 API-published posts in a 24-hour moving period enforced on the /media_publish endpoint.

#### Scheduling approach
Because not every platform exposes equal “native scheduling” via public APIs, the platform shall implement an internal scheduler that triggers uploads/publish calls at the chosen time, with retry/alerting and clear status reporting. (Where the platform provides native scheduling fields—e.g., YouTube publishAt—we shall use them.)

## Non-functional requirements and quality bar

### Quality targets and automated QA
The system shall implement automated checks before publishing:
- Scene/character consistency checks (detect abrupt identity drift when using recurring characters).
- Audio QC: loudness uniformity, no clipping, narration intelligibility, music ducking under speech.
- Caption QC: timing alignment and safe-area compliance (especially for 9:16).
- Format QC: platform codec/container constraints and file size limits (configurable per platform).

### Performance, reliability, and scaling
- Video generation jobs must be treated as asynchronous, long-running tasks with resumable execution, retries, and vendor failover. This is aligned with how Sora video generation is described as asynchronous (job object + polling/webhooks).
- The avatar pipeline must support at least 5-way parallel generation per request, with queueing and concurrency limits per vendor.

### Security and privacy
- OAuth tokens for social platforms must be stored encrypted, rotated, and scoped minimally.
- User-uploaded media and generated assets must have clear access controls (workspace, role-based).
- Audit logs must cover: generation requests, edits, publishing actions, and asset downloads.

### Safety, rights, and governance
#### Rights management
The system shall track licence metadata for any stock assets used (Pexels or others). Pexels allows free commercial use but warns about potential third-party rights in depicted trademarks/logos/brands—this must be surfaced in the UI and captured in metadata.

#### Deepfake/impersonation risk controls (critical for avatars)
The system shall require explicit user confirmation of rights/consent when creating avatars of real people, and shall provide watermark/provenance options for generated content. (Design requirement; implementation choices will depend on vendor capabilities and company policy.)

## Technical architecture and integrations
*Download the architecture diagram*

### Architecture principles
The system should be built around a workflow orchestrator that can run different generation pipelines (news, avatars, music videos, long-to-shorts) as composed DAGs:

Ingest → Plan (script/storyboard) → Generate (media) → QC → Edit/Render → Package → Publish → Learn.

### Key integration points (vendor adapters)
#### Video generation adapters
- **OpenAI Sora 2:** model-level adapter supporting text-to-video and image-to-video, portrait/landscape outputs, asynchronous job handling, and (where used) the Characters API reference mechanism.
- **Google Veo adapter:** supports text/image prompts, reference images for subject consistency, and output parameterisation (aspect ratio, resolution).

#### Audio adapters
- **Google Cloud TTS:** supports SSML for finer narration control (pauses, formatting).
- **ElevenLabs:** TTS + music + sound effects + dubbing capabilities, via their documented APIs.

#### Avatar/lip-sync adapter
HeyGen and/or D‑ID as initial candidates; keep vendor abstraction so we can swap without rewriting pipelines.

#### Publishing adapters
- YouTube Data API adapter with upload + update scheduling semantics.
- TikTok Content Posting API adapter with upload initialisation + post/draft flows.
- LinkedIn adapter with video upload (Videos API) and UGC post creation referencing URNs.
- Instagram/Facebook publishing adapter aligned to Meta’s sample-based Reels publishing requirements and rate limits.

### Media processing and rendering
- A rendering service shall compile timelines into final videos. FFmpeg’s documented filtering system and filtergraph syntax supports compositing workflows (split/crop/overlay) commonly used in programmatic editing pipelines.
- Caption exports should include WebVTT support for downstream compatibility.

## Metrics, analytics, experimentation and rollout

### Product and content KPIs
- Time-to-first-draft (topic input → first playable preview).
- Time-to-publish (topic input → scheduled/published).
- User revision rate (how often users must regenerate vs editing to fix).
- Publish success rate by platform connector.
- Content performance: view-through rate, retention, shares, saves (where APIs allow).

### Quality and safety KPIs
- Consistency failures caught pre-publish (character drift, caption overflow).
- Policy/risk flags (identity misuse, rights conflicts).
- Regeneration cost per published minute (vendor spend). ElevenLabs pricing is credit/minute or credit/character depending on capability, so we should track usage per pipeline.

### Rollout plan (suggested)
- **Phase one:** Internal alpha for the news video engine + editing + asset store (single workspace, limited accounts).
- **Phase two:** Add avatar pipeline (5-way parallel) and initial publishing connectors (YouTube + TikTok), then expand.
- **Phase three:** Add music video variants (AI + Pexels mode), long-to-shorts, and approvals/planner at scale.

## Scope changes (next decisions to lock)
- Exact “news timing” defaults (daily, weekly, hourly; and per-platform duration targets).
- Default number of scenes per format and target pacing (e.g., 20s, 45s, 90s, 3min). Sora 2 supports clip lengths via a seconds parameter with supported values (4–20 seconds) per the prompting guide; longer outputs likely require stitched multi-clip pipelines.
- Which lip-sync vendor is primary (HeyGen vs D‑ID) and any regional/legal constraints.
- Publishing coverage list (which platforms are “must ship” vs “later”), plus per-platform constraints and approval requirements.
