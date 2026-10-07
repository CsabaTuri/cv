# syntax=docker/dockerfile:1

# ---------- Build stage ----------
FROM node:26-alpine AS builder
WORKDIR /app

ARG NEXT_PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN
ENV NEXT_PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN=$NEXT_PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN

# Reproducible dependency install from the lockfile.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ---------- Runtime stage ----------
# Unprivileged nginx: runs as uid 101 and listens on 8080, so the container
# needs no root and no capabilities at all.
FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY --chown=101:101 nginx-security-headers.conf /etc/nginx/security-headers.conf
COPY --chown=101:101 nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder --chown=101:101 /app/out /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
