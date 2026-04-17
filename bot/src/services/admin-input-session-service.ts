import { prisma } from "../db.js";

export const squadAdminInputKinds = [
  "squad_display_name",
  "squad_traffic_price",
] as const;

export const tariffEditableKinds = [
  "tariff_name",
  "tariff_description",
  "tariff_usage_terms",
  "tariff_daily_price",
  "tariff_free_devices",
  "tariff_device_daily_price",
] as const;

export const tariffPeriodEditableKinds = [
  "tariff_period_create_days",
  "tariff_period_duration_days",
  "tariff_period_discount_percent",
] as const;

export const tariffSquadEditableKinds = [
  "tariff_squad_traffic_gb",
  "tariff_squad_traffic_price",
] as const;

export const adminInputKinds = [
  ...squadAdminInputKinds,
  "billing_referral_terms",
  "admin_users_search_prompt",
  "admin_users_search_results",
  "admin_broadcast_message_prompt",
  "admin_broadcast_preview",
  "tariff_create_name",
  ...tariffEditableKinds,
  ...tariffPeriodEditableKinds,
  ...tariffSquadEditableKinds,
] as const;

export type AdminInputKind = (typeof adminInputKinds)[number];
export type SquadAdminInputKind = (typeof squadAdminInputKinds)[number];
export type TariffEditableKind = (typeof tariffEditableKinds)[number];
export type TariffPeriodEditableKind = (typeof tariffPeriodEditableKinds)[number];
export type TariffSquadEditableKind = (typeof tariffSquadEditableKinds)[number];

export type AdminInputSessionData =
  | {
      kind: SquadAdminInputKind;
      squadUuid: string;
      tariffId?: null | undefined;
      tariffSquadId?: null | undefined;
      tariffPeriodId?: null | undefined;
    }
  | {
      kind: "billing_referral_terms";
      textValue?: string | null | undefined;
      squadUuid?: null | undefined;
      tariffId?: null | undefined;
      tariffSquadId?: null | undefined;
      tariffPeriodId?: null | undefined;
    }
  | {
      kind: "admin_users_search_prompt" | "admin_users_search_results";
      textValue?: string | null | undefined;
      squadUuid?: null | undefined;
      tariffId?: null | undefined;
      tariffSquadId?: null | undefined;
      tariffPeriodId?: null | undefined;
    }
  | {
      kind: "admin_broadcast_message_prompt" | "admin_broadcast_preview";
      textValue?: string | null | undefined;
      squadUuid?: null | undefined;
      tariffId?: null | undefined;
      tariffSquadId?: null | undefined;
      tariffPeriodId?: null | undefined;
    }
  | {
      kind: "tariff_create_name";
      squadUuid?: null | undefined;
      tariffId?: null | undefined;
      tariffSquadId?: null | undefined;
      tariffPeriodId?: null | undefined;
    }
  | {
      kind: TariffEditableKind;
      tariffId: number;
      squadUuid?: null | undefined;
      tariffSquadId?: null | undefined;
      tariffPeriodId?: null | undefined;
    }
  | {
      kind: TariffPeriodEditableKind;
      tariffId: number;
      tariffPeriodId?: number | null | undefined;
      squadUuid?: null | undefined;
      tariffSquadId?: null | undefined;
    }
  | {
      kind: TariffSquadEditableKind;
      tariffId: number;
      tariffSquadId: number;
      squadUuid?: null | undefined;
      tariffPeriodId?: null | undefined;
    };

function isAdminInputKind(value: string): value is AdminInputKind {
  return adminInputKinds.includes(value as AdminInputKind);
}

function parseAdminInputSession(
  session: Awaited<ReturnType<typeof prisma.adminInputSession.findUnique>>,
) {
  if (!session || !isAdminInputKind(session.kind)) {
    return null;
  }

  if (squadAdminInputKinds.includes(session.kind as SquadAdminInputKind)) {
    return session.squadUuid
      ? {
          ...session,
          kind: session.kind as SquadAdminInputKind,
          squadUuid: session.squadUuid,
        }
      : null;
  }

  if (session.kind === "tariff_create_name") {
    return {
      ...session,
      kind: session.kind,
    };
  }

  if (
    session.kind === "billing_referral_terms" ||
    session.kind === "admin_users_search_prompt" ||
    session.kind === "admin_users_search_results" ||
    session.kind === "admin_broadcast_message_prompt" ||
    session.kind === "admin_broadcast_preview"
  ) {
    return {
      ...session,
      kind: session.kind,
      textValue: session.textValue,
    };
  }

  if (
    (session.kind === "tariff_name" ||
      session.kind === "tariff_description" ||
      session.kind === "tariff_usage_terms" ||
      session.kind === "tariff_daily_price" ||
      session.kind === "tariff_free_devices" ||
      session.kind === "tariff_device_daily_price") &&
    session.tariffId !== null
  ) {
    return {
      ...session,
      kind: session.kind,
      tariffId: session.tariffId,
    };
  }

  if (
    (session.kind === "tariff_period_create_days" ||
      session.kind === "tariff_period_duration_days" ||
      session.kind === "tariff_period_discount_percent") &&
    session.tariffId !== null
  ) {
    return {
      ...session,
      kind: session.kind,
      tariffId: session.tariffId,
      tariffPeriodId: session.tariffPeriodId,
    };
  }

  if (
    (session.kind === "tariff_squad_traffic_gb" ||
      session.kind === "tariff_squad_traffic_price") &&
    session.tariffId !== null &&
    session.tariffSquadId !== null
  ) {
    return {
      ...session,
      kind: session.kind,
      tariffId: session.tariffId,
      tariffSquadId: session.tariffSquadId,
    };
  }

  return null;
}

export async function setAdminInputSession(
  telegramId: bigint,
  data: AdminInputSessionData,
) {
  const textValue = "textValue" in data ? (data.textValue ?? null) : null;

  return prisma.adminInputSession.upsert({
    where: {
      telegramId,
    },
    update: {
      kind: data.kind,
      textValue,
      squadUuid: data.squadUuid ?? null,
      tariffId: data.tariffId ?? null,
      tariffSquadId: data.tariffSquadId ?? null,
      tariffPeriodId: data.tariffPeriodId ?? null,
    },
    create: {
      telegramId,
      kind: data.kind,
      textValue,
      squadUuid: data.squadUuid ?? null,
      tariffId: data.tariffId ?? null,
      tariffSquadId: data.tariffSquadId ?? null,
      tariffPeriodId: data.tariffPeriodId ?? null,
    },
  });
}

export async function getAdminInputSession(telegramId: bigint) {
  const session = await prisma.adminInputSession.findUnique({
    where: {
      telegramId,
    },
  });

  return parseAdminInputSession(session);
}

export async function clearAdminInputSession(telegramId: bigint) {
  return prisma.adminInputSession.deleteMany({
    where: {
      telegramId,
    },
  });
}
