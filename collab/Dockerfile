# Collaboration service: Hocuspocus 4 needs Node 22+.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=1234
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 1234
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:1234/health || exit 1
CMD ["node", "dist/main.js"]
