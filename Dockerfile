# Game server image (apps/server). Build from the repo root:
#   docker build -t tdt-server .
#   docker run -p 8080:8080 -e ALLOWED_ORIGINS=http://localhost:5173 tdt-server

FROM node:22-alpine AS build
WORKDIR /app
# Install only what the server build needs (not the client's PixiJS/Vite).
COPY package.json package-lock.json ./
COPY packages/protocol/package.json packages/protocol/
COPY packages/sim/package.json packages/sim/
COPY apps/server/package.json apps/server/
RUN npm ci --include-workspace-root -w @tdt/server -w @tdt/sim -w @tdt/protocol --ignore-scripts --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/protocol packages/protocol
COPY packages/sim packages/sim
COPY apps/server apps/server
RUN npm run build -w @tdt/server

# The runtime image is just Node and one bundled file.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=build /app/apps/server/dist/index.cjs ./index.cjs
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- "http://127.0.0.1:${PORT}/health" > /dev/null || exit 1
# Node as PID 1 receives SIGTERM directly and runs the graceful drain.
CMD ["node", "index.cjs"]
