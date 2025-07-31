# syntax = docker/dockerfile:1

# Use Node.js LTS version
ARG NODE_VERSION=18.19.0
FROM node:${NODE_VERSION}-alpine AS base

LABEL fly_launch_runtime="Node.js"
LABEL maintainer="Step Challenge App"

# Node.js app lives here
WORKDIR /app

# Set production environment
ENV NODE_ENV="production"

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S stepapp -u 1001 -G nodejs


# Throw-away build stage to reduce size of final image
FROM base AS build

# Install packages needed to build node modules (Alpine packages)
RUN apk add --no-cache build-base python3 make g++

# Install node modules
COPY package-lock.json package.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY . .

# Remove development files
RUN rm -f .env .env.example README.md TODO.md


# Final stage for app image
FROM base

# Copy built application
COPY --from=build /app /app

# Setup sqlite3 on a separate volume with proper permissions
RUN mkdir -p /data && chown -R stepapp:nodejs /data
VOLUME /data

# Change ownership of the app directory
RUN chown -R stepapp:nodejs /app
USER stepapp

# Start the server by default, this can be overwritten at runtime
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD [ "node", "src/server.js" ]
