# Build context is the repository root (npm workspaces).
FROM node:22-alpine

# Prisma's schema/query engines need OpenSSL, which Alpine does not ship by default.
RUN apk add --no-cache openssl

WORKDIR /app

# Workspace manifests first for better layer caching.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --no-audit --no-fund

COPY shared ./shared
COPY backend ./backend

WORKDIR /app/backend
RUN npx prisma generate

EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
