FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM mcr.microsoft.com/playwright:v1.52.0
WORKDIR /
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/download.js ./
COPY --from=builder /app/server.js ./

EXPOSE 3000
CMD ["node", "server.js"]
