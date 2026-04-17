import { prisma } from "../db.js";

const BILLING_SETTINGS_ID = 1;

export async function getBillingSettings() {
  return prisma.billingSettings.upsert({
    where: {
      id: BILLING_SETTINGS_ID,
    },
    update: {},
    create: {
      id: BILLING_SETTINGS_ID,
    },
  });
}

export async function updateBillingSettings(
  data: Partial<{
    freeDevicesPerUser: number;
    paidDeviceDailyPriceMinor: number;
    trafficBillingEnabled: boolean;
    trafficPricePerGbMinor: number;
    referralProgramEnabled: boolean;
    referralTopUpRewardPercent: number;
    referralTermsText: string | null;
    freeSquadName: string;
    paidSquadName: string;
  }>,
) {
  return prisma.billingSettings.update({
    where: {
      id: BILLING_SETTINGS_ID,
    },
    data,
  });
}

export async function incrementFreeDevices(delta: number) {
  const settings = await getBillingSettings();
  const nextValue = Math.max(0, settings.freeDevicesPerUser + delta);

  return updateBillingSettings({
    freeDevicesPerUser: nextValue,
  });
}

export async function incrementPaidDeviceDailyPrice(deltaMinor: number) {
  const settings = await getBillingSettings();
  const nextValue = Math.max(0, settings.paidDeviceDailyPriceMinor + deltaMinor);

  return updateBillingSettings({
    paidDeviceDailyPriceMinor: nextValue,
  });
}

export async function toggleTrafficBilling() {
  const settings = await getBillingSettings();

  return updateBillingSettings({
    trafficBillingEnabled: !settings.trafficBillingEnabled,
  });
}

export async function incrementTrafficPrice(deltaMinor: number) {
  const settings = await getBillingSettings();
  const nextValue = Math.max(0, settings.trafficPricePerGbMinor + deltaMinor);

  return updateBillingSettings({
    trafficPricePerGbMinor: nextValue,
  });
}

export async function toggleReferralProgram() {
  const settings = await getBillingSettings();

  return updateBillingSettings({
    referralProgramEnabled: !settings.referralProgramEnabled,
  });
}

export async function incrementReferralTopUpRewardPercent(deltaPercent: number) {
  const settings = await getBillingSettings();
  const nextValue = Math.max(0, Math.min(100, settings.referralTopUpRewardPercent + deltaPercent));

  return updateBillingSettings({
    referralTopUpRewardPercent: nextValue,
  });
}

export async function updateReferralTermsText(referralTermsText: string | null) {
  return updateBillingSettings({
    referralTermsText,
  });
}
