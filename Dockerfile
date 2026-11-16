FROM node:22-alpine
WORKDIR /app
COPY scripts/build-worker.mjs ./scripts/build-worker.mjs
COPY worker ./worker
COPY dist ./dist
COPY scripts/local-server.mjs ./scripts/local-server.mjs
RUN node scripts/build-worker.mjs && cp dist/server/index.js dist/server/index.mjs
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["node", "scripts/local-server.mjs"]
