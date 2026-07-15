# Debian slim (glibc) rather than Alpine (musl): Remotion's headless Chromium
# is built for glibc and fails to launch on Alpine, so the premium caption
# renderer only works reliably here. ffmpeg (with libass+fribidi for RTL) +
# Noto fonts cover the libass fallback and Arabic shaping.
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg fontconfig ca-certificates openssl \
      fonts-noto-core fonts-noto-cjk fonts-dejavu-core \
      # Chromium runtime libraries required by Remotion's headless shell
      libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
      libgbm1 libasound2 libpango-1.0-0 libcairo2 libxkbcommon0 libxcomposite1 \
      libxdamage1 libxfixes3 libxrandr2 libxrender1 libxext6 libx11-6 libglib2.0-0 \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci --ignore-scripts

FROM deps AS build
COPY . .
RUN npx prisma generate && npm run build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app ./
# Install the bundled Noto Naskh Arabic for the libass caption fallback, and
# pre-download Remotion's Chromium so the premium renderer needs no network at
# render time (falls back to a runtime download if this build step has no net).
RUN mkdir -p /usr/share/fonts/truetype/app \
    && cp /app/remotion/public/fonts/NotoNaskhArabic-*.ttf /usr/share/fonts/truetype/app/ \
    && fc-cache -f \
    && (npx remotion browser ensure || echo "remotion browser will be fetched at runtime")
EXPOSE 3000
# web:    npm run start
# worker: npm run worker
CMD ["npm", "run", "start"]
