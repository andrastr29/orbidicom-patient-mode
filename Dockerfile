# syntax=docker/dockerfile:1

# ---- build stage: compile @orbidicom/core, then bundle the demo SPA ----------
FROM node:20-alpine AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# Install with the lockfile first (cached unless a manifest changes). corepack
# resolves the exact pnpm pinned in package.json "packageManager".
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/core/package.json ./packages/core/
COPY packages/vue/package.json ./packages/vue/
COPY packages/cli/package.json ./packages/cli/
COPY packages/create-orbidicom/package.json ./packages/create-orbidicom/
COPY apps/demo/package.json ./apps/demo/
RUN pnpm install --frozen-lockfile

# Build core (emits dist consumed by the demo) then bundle the SPA. We skip the
# vue/cli package builds here: Vite compiles @orbidicom/vue from source and the
# CLI isn't part of the static deployment.
COPY . .
RUN pnpm --filter @orbidicom/core build \
 && pnpm --filter @orbidicom/demo build

# ---- runtime stage: static SPA on unprivileged nginx -------------------------
# nginx-unprivileged listens on 8080 and runs as uid 101 (no root) out of the box.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

USER root
# Dir the startup script drops the optional DICOMweb proxy snippet into, plus
# make the web root writable so the script can (re)generate config.js as uid 101.
RUN mkdir -p /etc/nginx/orbidicom.d \
 && chown -R 101:101 /etc/nginx/orbidicom.d /usr/share/nginx/html

COPY deploy/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY deploy/docker-entrypoint.d/40-orbidicom-config.sh /docker-entrypoint.d/40-orbidicom-config.sh
RUN chmod +x /docker-entrypoint.d/40-orbidicom-config.sh
COPY --chown=101:101 --from=build /app/apps/demo/dist /usr/share/nginx/html

USER 101
EXPOSE 8080
# Base image's entrypoint runs /docker-entrypoint.d/*.sh (incl. ours) then nginx.
