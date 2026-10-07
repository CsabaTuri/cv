# syntax=docker/dockerfile:1

# ---------- Build stage ----------
FROM node:22-alpine AS builder
WORKDIR /app

ARG NEXT_PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN
ENV NEXT_PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN=$NEXT_PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN

ARG NEXT_PUBLIC_CRISP_WEBSITE_ID
ENV NEXT_PUBLIC_CRISP_WEBSITE_ID=$NEXT_PUBLIC_CRISP_WEBSITE_ID

COPY package.json ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

# ---------- Runtime stage ----------
# Static export is served by nginx for maximum performance.
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/out /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
