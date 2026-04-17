import { getAdminStats, getAdminUserListPage } from "../../services/admin-service.js";
import { getBroadcastAudienceStats } from "../../services/broadcast-service.js";
import { getBillingSettings } from "../../services/billing-settings-service.js";
import { getSystemStatusSnapshot } from "../../services/system-status-service.js";
import {
  getUserBalanceTopUpOrders,
  getUserPurchaseOrders,
} from "../../services/purchase-service.js";
import { getReferralSummary } from "../../services/referral-service.js";
import { getUserSubscriptionSummaries } from "../../services/remnawave-users-service.js";
import { getInternalSquads } from "../../services/remnawave-squads-service.js";
import { getActiveTariffs, getTariffs } from "../../services/tariff-service.js";
import type { ScreenDefinition } from "./definition.js";
import type { ScreenId } from "../screens.js";
import { adminScreenRegistry } from "./admin.js";
import { rootScreenRegistry } from "./root.js";

const identityLoader: NonNullable<ScreenDefinition["load"]> = async (user) => ({ user });

const screenDefinitions: ScreenDefinition[] = [
  {
    id: "home",
    load: identityLoader,
    render: rootScreenRegistry.home,
  },
  {
    id: "catalog",
    load: async () => ({
      tariffs: await getActiveTariffs(),
    }),
    render: rootScreenRegistry.catalog,
  },
  {
    id: "balance",
    load: async (user) => ({
      topUpOrders: await getUserBalanceTopUpOrders(user.id),
    }),
    render: rootScreenRegistry.balance,
  },
  {
    id: "referrals",
    load: async (user) => {
      const [pricingSettings, referralSummary] = await Promise.all([
        getBillingSettings(),
        getReferralSummary(user.id),
      ]);

      return {
        pricingSettings,
        referralSummary: referralSummary ?? undefined,
      };
    },
    render: rootScreenRegistry.referrals,
  },
  {
    id: "profile",
    load: identityLoader,
    render: rootScreenRegistry.profile,
  },
  {
    id: "my_subscriptions",
    load: async (user) => {
      const [purchaseOrders, subscriptions] = await Promise.all([
        getUserPurchaseOrders(user.id),
        getUserSubscriptionSummaries(user.id),
      ]);

      return { purchaseOrders, subscriptions };
    },
    render: rootScreenRegistry.my_subscriptions,
  },
  {
    id: "help",
    load: identityLoader,
    render: rootScreenRegistry.help,
  },
  {
    id: "admin",
    access: "admin",
    load: identityLoader,
    render: rootScreenRegistry.admin,
  },
  {
    id: "admin_users",
    access: "admin",
    load: async () => ({
      adminUsersPage: await getAdminUserListPage(1, 8),
    }),
    render: adminScreenRegistry.admin_users,
  },
  {
    id: "admin_broadcast",
    access: "admin",
    load: async () => ({
      adminBroadcastStats: await getBroadcastAudienceStats(),
    }),
    render: adminScreenRegistry.admin_broadcast,
  },
  {
    id: "admin_system",
    access: "admin",
    load: identityLoader,
    render: adminScreenRegistry.admin_system,
  },
  {
    id: "admin_system_status",
    access: "admin",
    load: async () => ({
      adminSystemStatus: await getSystemStatusSnapshot(),
    }),
    render: adminScreenRegistry.admin_system_status,
  },
  {
    id: "admin_tariffs",
    access: "admin",
    load: async () => ({
      tariffs: await getTariffs(),
    }),
    render: adminScreenRegistry.admin_tariffs,
  },
  {
    id: "admin_pricing",
    access: "admin",
    load: async () => ({
      pricingSettings: await getBillingSettings(),
    }),
    render: adminScreenRegistry.admin_pricing,
  },
  {
    id: "admin_pricing_free",
    access: "admin",
    load: async () => ({
      pricingSettings: await getBillingSettings(),
    }),
    render: adminScreenRegistry.admin_pricing_free,
  },
  {
    id: "admin_pricing_devices",
    access: "admin",
    load: async () => ({
      pricingSettings: await getBillingSettings(),
    }),
    render: adminScreenRegistry.admin_pricing_devices,
  },
  {
    id: "admin_referrals",
    access: "admin",
    load: async () => ({
      pricingSettings: await getBillingSettings(),
    }),
    render: adminScreenRegistry.admin_referrals,
  },
  {
    id: "admin_pricing_traffic",
    access: "admin",
    load: async () => ({
      pricingSettings: await getBillingSettings(),
    }),
    render: adminScreenRegistry.admin_pricing_traffic,
  },
  {
    id: "admin_squads",
    access: "admin",
    load: async () => ({
      squads: await getInternalSquads(),
    }),
    render: adminScreenRegistry.admin_squads,
  },
];

const screenRegistry = new Map<ScreenId, ScreenDefinition>(
  screenDefinitions.map((definition) => [definition.id, definition]),
);

export function getScreenDefinition(screenId: ScreenId) {
  const definition = screenRegistry.get(screenId);

  if (!definition) {
    throw new Error(`Экран ${screenId} не зарегистрирован`);
  }

  return definition;
}
