# Single-container production build: the backend serves the API, the
# WebSocket upgrade endpoint, and the frontend's static build, all from one
# Node process. See backend/README.md and frontend/README.md for what each
# half does; this file just assembles them for deployment.

# ---- Build the frontend ----
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# Empty on purpose: the backend serves this build itself in production, so
# API calls are same-origin -- no separate frontend host, no CORS needed.
# (frontend/src/api/client.js falls back to localhost:4000 only when this
# is genuinely unset, not when it's set-but-empty.)
ENV VITE_API_URL=""
RUN npm run build

# ---- Backend runtime ----
# node:*-slim (glibc), not alpine, so bcrypt's prebuilt native binary just
# works instead of needing a musl-compatible build toolchain.
FROM node:20-bookworm-slim
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/ ./
COPY --from=frontend-build /app/frontend/dist /app/frontend-dist

ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "src/server.js"]
