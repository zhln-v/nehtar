import type { InlineKeyboard } from "grammy";

import type {
  BalanceTopUpOrder,
  BillingSettings,
  Prisma,
  RemnawaveInternalSquad,
  Tariff,
  TelegramUser,
} from "../../generated/prisma/index.js";
import type { getAdminStats } from "../../services/admin-service.js";
import type {
  AdminUserListPage,
} from "../../services/admin-service.js";
import type { BroadcastAudienceStats } from "../../services/broadcast-service.js";
import type { SystemStatusSnapshot } from "../../services/system-status-service.js";
import type {
  ReferralSummary,
} from "../../services/referral-service.js";
import type {
  UserRemnawaveAccount,
  UserSubscriptionSummary,
} from "../../services/remnawave-users-service.js";

export type RenderedScreen = {
  text: string;
  replyMarkup: InlineKeyboard;
};

export type AdminStats = Awaited<ReturnType<typeof getAdminStats>>;
export type AdminUsersPage = AdminUserListPage;
export type AdminBroadcastStats = BroadcastAudienceStats;
export type AdminSystemStatus = SystemStatusSnapshot;
export type PricingSettings = BillingSettings;
export type Tariffs = Tariff[];
export type PurchaseOrders = Prisma.PurchaseOrderGetPayload<{
  include: {
    tariff: true;
    tariffPeriod: true;
  };
}>[];
export type UserSubscriptions = UserSubscriptionSummary[];
export type UserSubscriptionDetails = UserRemnawaveAccount[];
export type BalanceTopUpOrders = BalanceTopUpOrder[];

export type ScreenRenderContext = {
  user: TelegramUser;
  adminStats?: AdminStats | undefined;
  adminUsersPage?: AdminUsersPage | undefined;
  adminBroadcastStats?: AdminBroadcastStats | undefined;
  adminSystemStatus?: AdminSystemStatus | undefined;
  pricingSettings?: PricingSettings | undefined;
  squads?: RemnawaveInternalSquad[] | undefined;
  tariffs?: Tariffs | undefined;
  purchaseOrders?: PurchaseOrders | undefined;
  subscriptions?: UserSubscriptions | undefined;
  topUpOrders?: BalanceTopUpOrders | undefined;
  referralSummary?: ReferralSummary | undefined;
};
