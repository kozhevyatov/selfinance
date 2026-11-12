# ---------- сборка ----------
FROM node:22-bookworm-slim AS build
WORKDIR /src

# инструменты на случай, если для better-sqlite3 не найдётся готовой сборки
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build \
 && npm prune --omit=dev --no-audit --no-fund

# ---------- запуск ----------
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=1444

COPY --from=build /src/node_modules ./node_modules
COPY --from=build /src/apps/api/package.json ./package.json
COPY --from=build /src/apps/api/dist ./api
COPY --from=build /src/apps/web/dist ./web

VOLUME ["/data"]
EXPOSE 1444
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:1444/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "api/server.js"]
