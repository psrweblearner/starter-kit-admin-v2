# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache dumb-init \
  && npm install -g pm2

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Ensure public key exists at the default path used by the app.
RUN test -f /app/config/public.pem

EXPOSE 4000

# pm2-runtime keeps Node in the foreground (correct for Docker + --restart unless-stopped).
ENTRYPOINT ["dumb-init", "--"]
CMD ["pm2-runtime", "start", "index.js", "--name", "admin"]
