FROM node:22-alpine AS base
# ffmpeg (renders) + fonts with full Arabic coverage for burned-in captions
# via libass. font-noto-arabic provides "Noto Sans Arabic" (proper shaping);
# fc-cache builds the fontconfig index so libass resolves families at render.
# chromium: used by Remotion for the premium caption renderer. Remotion's own
# chrome-headless-shell is glibc-only and won't run on Alpine/musl, so we point
# Remotion at the system chromium via REMOTION_BROWSER_EXECUTABLE.
RUN apk add --no-cache openssl ffmpeg fontconfig \
      font-noto font-noto-arabic font-noto-extra ttf-dejavu \
      chromium nss freetype harfbuzz ca-certificates \
    && fc-cache -f
ENV REMOTION_BROWSER_EXECUTABLE=/usr/bin/chromium-browser \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
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
# Install the bundled Noto Naskh Arabic into the system so the libass caption
# fallback resolves the exact family name the ASS references (independent of
# whatever the distro's font-noto-arabic package happens to provide).
RUN mkdir -p /usr/share/fonts/truetype/app \
    && cp /app/remotion/public/fonts/NotoNaskhArabic-*.ttf /usr/share/fonts/truetype/app/ \
    && fc-cache -f
EXPOSE 3000
# web:    npm run start
# worker: npm run worker
CMD ["npm", "run", "start"]
