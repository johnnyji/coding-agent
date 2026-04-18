FROM node:20-bookworm-slim AS base

RUN npm install -g pnpm

# ---- Builder ----
FROM base AS builder

WORKDIR /app

# Copy workspace manifests for layer caching
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/shared/ ./packages/shared/
COPY apps/web/ ./apps/web/

# Build shared first, then web
RUN pnpm --filter @coding-agent/shared build \
    && pnpm --filter @coding-agent/web build

# ---- Production image ----
FROM node:20-bookworm-slim AS production

WORKDIR /app

# Copy standalone output (includes node_modules and server.js)
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
