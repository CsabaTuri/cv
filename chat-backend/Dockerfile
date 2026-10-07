# ============================================================
# Stage 1: deps — csak production dependency-k
# ============================================================
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force


# ============================================================
# Stage 2: runner — minimál production image
# ============================================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Nem-root user (biztonság)
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nodejs

# Csak a szükséges fájlok
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs package.json ./
COPY --chown=nodejs:nodejs server.js ./

USER nodejs

EXPOSE 3000

# ✅ HEALTHCHECK itt van: USER után, CMD előtt
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]