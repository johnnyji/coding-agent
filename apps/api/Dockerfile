# ---- Base: Node 20 + system deps ----
FROM node:20-bookworm-slim AS base

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    wget \
    unzip \
    gnupg \
    ca-certificates \
    build-essential \
    libssl-dev \
    libncurses-dev \
    # Needed for Playwright Chromium
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libgtk-3-0 \
    libgbm1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Install asdf for version-managed Elixir/Erlang
ENV ASDF_DIR=/root/.asdf
RUN git clone https://github.com/asdf-vm/asdf.git "$ASDF_DIR" --branch v0.14.0 \
    && echo ". $ASDF_DIR/asdf.sh" >> /root/.bashrc \
    && echo ". $ASDF_DIR/asdf.sh" >> /root/.profile

ENV PATH="$ASDF_DIR/shims:$ASDF_DIR/bin:$PATH"

# Install Erlang/OTP 25 and Elixir 1.15.4
RUN asdf plugin add erlang https://github.com/asdf-vm/asdf-erlang.git \
    && asdf plugin add elixir https://github.com/asdf-vm/asdf-elixir.git \
    && KERL_BUILD_DOCS=no KERL_CONFIGURE_OPTIONS="--disable-debug --without-javac" \
       asdf install erlang 25.3.2 \
    && asdf install elixir 1.15.4-otp-25 \
    && asdf global erlang 25.3.2 \
    && asdf global elixir 1.15.4-otp-25

# Install Hex and Rebar (Elixir package managers)
RUN mix local.hex --force && mix local.rebar --force

# Install yarn and pnpm
RUN npm install -g yarn pnpm

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Install Playwright MCP server
RUN npm install -g @playwright/mcp

# Install Playwright Chromium browser with system dependencies
RUN npx playwright install --with-deps chromium

# ---- Builder: install and build the monorepo ----
FROM base AS builder

WORKDIR /app

# Copy workspace manifest files first for layer caching
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Install all workspace dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/shared/ ./packages/shared/
COPY apps/api/ ./apps/api/

# Build shared package first, then api
RUN pnpm --filter @coding-agent/shared build \
    && pnpm --filter @coding-agent/api build

# ---- Production image ----
FROM base AS production

WORKDIR /app

# Copy workspace manifest for production install
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Production install (skip devDependencies)
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Copy migration SQL files (needed at runtime)
COPY apps/api/src/db/migrations ./apps/api/dist/db/migrations

EXPOSE 8080

CMD ["node", "apps/api/dist/index.js"]
