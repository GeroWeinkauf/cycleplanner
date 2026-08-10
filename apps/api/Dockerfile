# ── Build & Deploy Stage ──
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/tsconfig.json packages/shared/
COPY apps/api/package.json apps/api/tsconfig.json apps/api/
RUN pnpm install --frozen-lockfile
COPY packages/shared/src packages/shared/src/
COPY apps/api/src apps/api/src/
RUN pnpm --filter @cycleplanner/api build

# Use pnpm deploy to create a standalone, flat-node_modules deployment
RUN pnpm --filter @cycleplanner/api deploy --prod --legacy /deploy

# Copy shared package dist into the deploy directory
RUN mkdir -p /deploy/node_modules/@cycleplanner/shared && \
    cp -r packages/shared/dist /deploy/node_modules/@cycleplanner/shared/dist && \
    cp packages/shared/package.json /deploy/node_modules/@cycleplanner/shared/package.json

# Copy extra config files
RUN mkdir -p /deploy/config && \
    cp config/profiles.json config/score-weights.json /deploy/config/ 2>/dev/null || true

# ── Production Stage ──
FROM node:22-alpine
# Install Docker CLI for container management
RUN apk add --no-cache docker-cli
WORKDIR /app
COPY --from=build /deploy /app
ENV API_PORT=3000
ENV API_HOST=0.0.0.0
ENV VALHALLA_URL=http://valhalla:8002
EXPOSE 3000
CMD ["node", "dist/server.js"]