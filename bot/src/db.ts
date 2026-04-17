import { PrismaPg } from "@prisma/adapter-pg";

import { config } from "./config.js";
import { PrismaClient } from "./generated/prisma/index.js";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
  prismaAdapter?: PrismaPg;
};

const adapter =
  globalForPrisma.prismaAdapter ??
  new PrismaPg({
    connectionString: config.DATABASE_URL,
  });

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
  });

if (config.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaAdapter = adapter;
}

export async function disconnectPrisma() {
  await prisma.$disconnect();
}
