# syntax=docker/dockerfile:1
# The GraphysX world service: one island per container, no browser.
#
#   docker build -f world-service/Dockerfile -t graphysx-world:<rev> .
#   docker run -p 127.0.0.1:18120:18120 -v world-data:/data graphysx-world:<rev>
#
# The bundle (world-service/dist/world.js) carries the scene runtime, the island rules and
# Rapier's WASM, so the image needs Node and nothing from node_modules. Each start records to
# /data/recordings/instances/<UUID>/graphysx-recording.ndjson (replay with world-service/replay.mjs).
# First-person images need the separate image sidecar (Dockerfile.images): set
# WORLD_IMAGE_SIDECAR and WORLD_IMAGE_SOURCE, and WORLD_IMAGES=1.

FROM node:22-bookworm-slim AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
RUN npx vite build -c vite.world-service.config.ts

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    WORLD_HOST=0.0.0.0 \
    WORLD_PORT=18120 \
    WORLD_RECORD=1 \
    WORLD_IMAGES=0
WORKDIR /app
COPY --from=build /src/world-service/dist/world.js world-service/dist/world.js
COPY world-service/main.mjs world-service/server.mjs world-service/image.mjs world-service/replay.mjs world-service/recording.mjs world-service/archive.mjs world-service/startup.mjs world-service/register-recording.mjs world-service/API.md world-service/
RUN mkdir -p /data/recordings && chown -R node:node /data
USER node
VOLUME /data
EXPOSE 18120
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.WORLD_PORT || 18120) + '/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
# The root is stable across restarts; each world instance owns its opaque subdirectory.
CMD ["sh", "-c", "exec node world-service/main.mjs --record-dir \"${WORLD_RECORD_DIR:-/data/recordings}\""]
