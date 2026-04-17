# Orbit Escape Bot

Шаблон Telegram-бота на `grammy`, `bun` и `Prisma`.

## Локальный старт

1. Скопируй `.env.example` в `.env`
2. Укажи `BOT_TOKEN`
3. Подними Postgres
4. Установи зависимости
5. Прогони Prisma
6. Запусти бота

```bash
cd /Users/vlad/Documents/OrbitEscape/bot
cp .env.example .env
bun install
docker compose up -d
bun run prisma:generate
bun run prisma:migrate --name init
bun run dev
```

## Docker Compose

В корне проекта теперь есть общий [docker-compose.yml](/Users/vlad/Documents/OrbitEscape/docker-compose.yml), который поднимает:

- `bot`
- `bot-db`
- `remnawave`
- `remnawave-db`
- `remnawave-redis`
- `caddy`

Перед запуском проверь переменные:

- в [bot/.env.example](/Users/vlad/Documents/OrbitEscape/bot/.env.example) для контейнерного режима `DATABASE_URL` должен указывать на `bot-db`, например `postgresql://postgres:postgres@bot-db:5432/orbit_escape_bot`
- если нужен webhook, выставь `BOT_MODE=webhook` и `WEBHOOK_PUBLIC_URL=https://bot.nehtar.ru/telegram/webhook`
- в `remnawave/.env` замени локальные домены на боевые:
  `FRONT_END_DOMAIN=admin.nehtar.ru`
  `PANEL_DOMAIN=admin.nehtar.ru`
  `SUB_PUBLIC_DOMAIN=sub.nehtar.ru`
- создай `remnawave/subscription/.env` на основе [remnawave/subscription/.env.example](/Users/vlad/Documents/OrbitEscape/remnawave/subscription/.env.example) и укажи `REMNAWAVE_API_TOKEN`

Запуск:

```bash
cd /Users/vlad/Documents/OrbitEscape
docker compose up -d --build
```

## GitHub Actions

Добавлены workflow:

- [.github/workflows/ci.yml](/Users/vlad/Documents/OrbitEscape/.github/workflows/ci.yml) для `typecheck`, `prisma generate`, `docker build` и проверки `docker compose config`
- [.github/workflows/deploy.yml](/Users/vlad/Documents/OrbitEscape/.github/workflows/deploy.yml) для деплоя на сервер по паролю через `sshpass`

Нужные GitHub Secrets:

- `DEPLOY_HOST`
- `DEPLOY_PORT`
- `DEPLOY_USER`
- `DEPLOY_PASSWORD`
- `DEPLOY_PATH`

`.env` файлы не хранятся в GitHub Secrets. Они должны один раз лежать на сервере по путям:

- `$DEPLOY_PATH/bot/.env`
- `$DEPLOY_PATH/remnawave/.env`
- `$DEPLOY_PATH/remnawave/subscription/.env`

Workflow деплоя их не перезаписывает. Он только проверяет, что файлы уже существуют, и затем обновляет код и перезапускает контейнеры.
