# Base image with Debian so we can install native deps for node-canvas
FROM node:20-bookworm-slim

ENV NODE_ENV=production \
    NPM_CONFIG_LOGLEVEL=warn

# Install system dependencies required by `canvas` (node-canvas)
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    libpixman-1-dev \
    fonts-dejavu-core \
    build-essential \
    pkg-config \
    python3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci

# Copy the rest of the app and build
COPY . .
RUN npm run build

# The bot is a background worker; no ports exposed
CMD ["node", "dist/index.js"]


