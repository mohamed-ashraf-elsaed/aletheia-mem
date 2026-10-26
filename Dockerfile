# Aletheia server image. Pin the base image; no secrets are baked in.
FROM oven/bun:1.3.10-alpine

RUN addgroup -S aletheia && adduser -S -G aletheia aletheia

WORKDIR /app
COPY package.json ./
COPY bin ./bin
COPY src ./src
COPY public ./public
COPY public-hub ./public-hub
COPY prompts ./prompts
COPY vendor ./vendor

RUN mkdir -p /data && chown -R aletheia:aletheia /app /data
USER aletheia

# Loopback by default. The compose file uses the host network so the service stays on 127.0.0.1.
ENV ALETHEIA_DATA_DIR=/data \
    ALETHEIA_PORT=37790

EXPOSE 37790
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:37790/healthz >/dev/null || exit 1

ENTRYPOINT ["bun", "bin/aletheia-server.mjs"]
