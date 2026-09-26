# Build context is the repository root (npm workspaces).
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --no-audit --no-fund

COPY shared ./shared
COPY frontend ./frontend

WORKDIR /app/frontend

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
