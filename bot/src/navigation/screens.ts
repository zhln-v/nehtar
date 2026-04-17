export const screenIds = [
  "home",
  "balance",
  "referrals",
  "catalog",
  "profile",
  "my_subscriptions",
  "help",
  "admin",
  "admin_users",
  "admin_broadcast",
  "admin_system",
  "admin_system_status",
  "admin_tariffs",
  "admin_pricing",
  "admin_pricing_free",
  "admin_pricing_devices",
  "admin_referrals",
  "admin_pricing_traffic",
  "admin_squads",
] as const;

export type ScreenId = (typeof screenIds)[number];

export function isScreenId(value: string): value is ScreenId {
  return screenIds.includes(value as ScreenId);
}
