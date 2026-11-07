# Playwright's official image ships Chromium and all its system libraries.
# Keep this tag in step with the "playwright" version in package.json.
FROM mcr.microsoft.com/playwright:v1.63.0-noble

WORKDIR /app
ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY tsconfig.json ./
COPY src ./src
COPY assets ./assets

EXPOSE 3000
CMD ["npm", "start"]
