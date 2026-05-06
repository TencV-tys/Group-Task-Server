# Dockerfile - Fixed with public folder (REMOVED npm audit fix)
FROM node:20-alpine AS builder

# Update Alpine to fix known vulns
RUN apk update && apk upgrade && \
    apk add --no-cache openssl && \
    rm -rf /var/cache/apk/*

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

# ✅ FIXED: Remove npm audit fix which causes build failures
RUN npm clean-install --no-audit && \
    npm cache clean --force

RUN npx prisma generate
COPY . .
COPY --chown=nodejs:nodejs public ./public

RUN npm run build

FROM node:20-alpine

RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init openssl && \
    rm -rf /var/cache/apk/*

WORKDIR /app

COPY package*.json ./
RUN npm clean-install --only=production --no-audit && \
    npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma/
COPY --from=builder /app/public ./public

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 5000
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]