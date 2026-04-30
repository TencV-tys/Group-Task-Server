# Dockerfile - Minimal Vulnerabilities
FROM node:20-alpine AS builder

# Update Alpine to fix known vulns
RUN apk update && apk upgrade && \
    apk add --no-cache openssl && \
    rm -rf /var/cache/apk/*

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

# Force clean install
RUN npm clean-install && \
    npm audit fix --force && \
    npm cache clean --force

RUN npx prisma generate
COPY . .
RUN npm run build

FROM node:20-alpine

RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init openssl && \
    rm -rf /var/cache/apk/*

WORKDIR /app

COPY package*.json ./
RUN npm clean-install --only=production && \
    npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma/

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 5000
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]