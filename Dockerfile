FROM mcr.microsoft.com/playwright:v1.50.0-noble

WORKDIR /

COPY package*.json ./
RUN npm ci

COPY /dist ./dist

COPY download.js ./
COPY server.js ./

EXPOSE 3000

CMD ["node", "server.js"]
