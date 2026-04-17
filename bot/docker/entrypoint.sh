#!/bin/sh
set -eu

echo "Generating Prisma client"
bun run prisma:generate

echo "Applying Prisma migrations"
bun ./node_modules/prisma/build/index.js migrate deploy

echo "Starting bot"
exec bun run src/index.ts
