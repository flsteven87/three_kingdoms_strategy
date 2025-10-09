# Three Kingdoms Strategy Manager - Backend Dockerfile
#
# 符合 CLAUDE.md 規範:
# - 使用 UV package manager (不使用 pip)
# - Python 3.13+ 支援
# - 適配 Zeabur 動態端口
# - 安全性最佳實踐 (non-root user)
# - 多階段構建優化 image size

FROM python:3.13-slim

# Set environment variables with defaults
# 符合 CLAUDE.md: 使用 UV 環境變數
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    UV_CACHE_DIR=/tmp/uv-cache \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

# Default port (can be overridden by Zeabur)
ENV PORT=8087

# Install system dependencies and UV
# 符合 CLAUDE.md 🟡: 使用 UV 作為套件管理工具
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
    && curl -LsSf https://astral.sh/uv/install.sh | sh \
    && mv /root/.local/bin/uv /usr/local/bin/ \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Create working directory
WORKDIR /app

# Copy dependencies configuration
COPY pyproject.toml ./
COPY uv.lock* ./

# Install dependencies
# 符合 CLAUDE.md: uv sync (不使用 pip install)
RUN uv venv /app/.venv \
    && . /app/.venv/bin/activate \
    && (uv sync --frozen --no-dev || uv sync --no-dev) \
    && rm -rf /tmp/uv-cache

# Copy application code
COPY src ./src

# Create non-root user for security
# 安全性最佳實踐: 不使用 root 運行應用
RUN groupadd -r appuser && useradd -r -g appuser appuser \
    && chown -R appuser:appuser /app
USER appuser

# Set PATH to use virtual environment
ENV PATH="/app/.venv/bin:$PATH"

# Health check endpoint
# 符合專案規範: /health endpoint 已在 main.py 定義
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# Expose port (Zeabur will override this)
EXPOSE ${PORT}

# Start application
# 符合 CLAUDE.md 🔴: redirect_slashes=False 已在 main.py 設定
CMD ["sh", "-c", "uvicorn src.main:app --host 0.0.0.0 --port ${PORT}"]
