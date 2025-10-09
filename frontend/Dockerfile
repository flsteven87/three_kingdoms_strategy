# Three Kingdoms Strategy Manager - Frontend Dockerfile
#
# 符合 CLAUDE.md 規範:
# - Multi-stage build (優化 image size)
# - 使用 npm ci (不使用 npm install)
# - Nginx 作為 production server
# - 適配 Zeabur 動態端口
# - React Router SPA fallback 支援

# ========================================
# Stage 1: Build
# ========================================
FROM node:22-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
# 使用 npm ci 確保依賴版本一致性
RUN npm ci --quiet

# Copy source code
COPY . .

# Build application
# Vite 會產生 dist/ 目錄
RUN npm run build

# ========================================
# Stage 2: Production with Nginx
# ========================================
FROM nginx:alpine

# Copy optimized nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Copy built application from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Health check
# 符合 nginx.conf 中的 /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

# Set default port (Zeabur will override this)
ENV PORT=80

# Expose port
EXPOSE $PORT

# Create nginx startup script for dynamic port configuration
# Zeabur 會動態分配端口，需要在啟動時修改 nginx 配置
RUN echo '#!/bin/sh' > /start.sh && \
    echo 'sed -i "s/listen 80;/listen $PORT;/" /etc/nginx/nginx.conf' >> /start.sh && \
    echo 'nginx -t && nginx -g "daemon off;"' >> /start.sh && \
    chmod +x /start.sh

# Start nginx with port configuration and validation
CMD ["/start.sh"]
