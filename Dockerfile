FROM node:22-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NODE_ENV=production
RUN npm run build

FROM node:22-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libnspr4 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libatspi2.0-0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2 libwayland-client0 \
    fonts-liberation fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/download.js ./
COPY --from=builder /app/server.js ./

ENV PLAYWRIGHT_BROWSERS_PATH=/app/browsers
RUN npm ci --omit=dev \
    && npx playwright install chromium \
    && rm -rf /tmp/*

USER node
EXPOSE 3000
CMD ["node", "server.js"]
