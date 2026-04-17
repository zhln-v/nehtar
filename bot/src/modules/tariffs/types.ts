import {
  tariffEditableKinds,
  tariffPeriodEditableKinds,
  tariffSquadEditableKinds,
  type AdminInputKind,
} from "../../services/admin-input-session-service.js";

export { tariffEditableKinds, tariffPeriodEditableKinds, tariffSquadEditableKinds };

export const tariffInputKindMap = {
  name: "tariff_name",
  description: "tariff_description",
  usage_terms: "tariff_usage_terms",
  daily_price: "tariff_daily_price",
  free_devices: "tariff_free_devices",
  device_daily_price: "tariff_device_daily_price",
} as const satisfies Record<string, AdminInputKind>;

export const tariffPeriodInputKindMap = {
  create_days: "tariff_period_create_days",
  duration_days: "tariff_period_duration_days",
  discount_percent: "tariff_period_discount_percent",
} as const satisfies Record<string, AdminInputKind>;

export const tariffSquadInputKindMap = {
  traffic_gb: "tariff_squad_traffic_gb",
  traffic_price: "tariff_squad_traffic_price",
} as const satisfies Record<string, AdminInputKind>;

export type TariffInputType = keyof typeof tariffInputKindMap;
export type TariffPeriodInputType = keyof typeof tariffPeriodInputKindMap;
export type TariffSquadInputType = keyof typeof tariffSquadInputKindMap;
export type TariffSection = "basic" | "servers" | "duration" | "devices";

export function isTariffEditableKind(
  value: string,
): value is (typeof tariffEditableKinds)[number] {
  return tariffEditableKinds.includes(value as (typeof tariffEditableKinds)[number]);
}

export function isTariffPeriodEditableKind(
  value: string,
): value is (typeof tariffPeriodEditableKinds)[number] {
  return tariffPeriodEditableKinds.includes(
    value as (typeof tariffPeriodEditableKinds)[number],
  );
}

export function isTariffSquadEditableKind(
  value: string,
): value is (typeof tariffSquadEditableKinds)[number] {
  return tariffSquadEditableKinds.includes(
    value as (typeof tariffSquadEditableKinds)[number],
  );
}
