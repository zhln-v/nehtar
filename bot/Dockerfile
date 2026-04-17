FROM oven/bun:1.3.10-slim

WORKDIR /app

ARG DATABASE_URL=postgresql://postgres:postgres@localhost:5432/orbit_escape_bot?schema=public
ARG SHADOW_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/orbit_escape_bot_shadow?schema=public
ENV DATABASE_URL=${DATABASE_URL}
ENV SHADOW_DATABASE_URL=${SHADOW_DATABASE_URL}

COPY package.json bun.lock tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
COPY docker/entrypoint.sh /usr/local/bin/orbit-escape-entrypoint.sh

RUN bun install --frozen-lockfile
RUN chmod +x /usr/local/bin/orbit-escape-entrypoint.sh
RUN bun run prisma:generate

EXPOSE 8080

CMD ["orbit-escape-entrypoint.sh"]
