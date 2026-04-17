import type { RemnawaveInternalSquad } from "../../generated/prisma/index.js";
import type { TariffDetails } from "../../services/tariff-service.js";
import { formatMoneyMinor } from "../../services/pricing-format-service.js";
import {
  buildTariffAddSquadKeyboard,
  buildTariffBasicKeyboard,
  buildTariffDevicesKeyboard,
  buildTariffDurationKeyboard,
  buildTariffMainKeyboard,
  buildTariffPeriodKeyboard,
  buildTariffServersKeyboard,
  buildTariffSquadKeyboard,
} from "../ui/keyboards.js";
import {
  renderCodeLine,
  renderInputPrompt,
  renderScreenLayout,
  renderSection,
  renderTariffBasicSummary,
  renderTariffDevicesSummary,
  renderTariffPeriodsSummary,
  renderTariffSectionHeader,
  renderTariffSquadsSummary,
  renderTariffSummary,
  calculateTariffPeriodPriceMinor,
} from "../ui/text.js";
import type { RenderedScreen } from "../screens/types.js";
import type { TariffSection } from "./tariff-types.js";

export function renderTariffScreen(
  tariff: TariffDetails,
  section: TariffSection = "main",
): RenderedScreen {
  const keyboard =
    section === "basic"
      ? buildTariffBasicKeyboard(tariff.id)
      : section === "servers"
        ? buildTariffServersKeyboard(tariff)
        : section === "duration"
          ? buildTariffDurationKeyboard(tariff)
          : section === "devices"
            ? buildTariffDevicesKeyboard(tariff.id)
            : buildTariffMainKeyboard(tariff);

  return {
    text: [
      renderTariffSectionHeader(section),
      "",
      section === "basic"
        ? renderTariffBasicSummary(tariff)
        : section === "duration"
          ? renderTariffPeriodsSummary(tariff)
          : section === "devices"
            ? renderTariffDevicesSummary(tariff)
            : section === "servers"
              ? renderTariffSquadsSummary(tariff)
              : renderTariffSummary(tariff),
    ].join("\n"),
    replyMarkup: keyboard,
  };
}

export function renderTariffInputPrompt(
  tariff: TariffDetails,
  title: string,
  instructions: string[],
  backSection: TariffSection,
  options: {
    currentValue?: string | null | undefined;
    errorMessage?: string | undefined;
  } = {},
): RenderedScreen {
  const backCallback =
    backSection === "basic"
      ? `tariffnav:basic:${tariff.id}`
      : backSection === "servers"
        ? `tariffnav:servers:${tariff.id}`
        : backSection === "duration"
          ? `tariffnav:duration:${tariff.id}`
          : `tariffnav:devices:${tariff.id}`;

  return renderInputPrompt(title, instructions, {
    currentValue: options.currentValue,
    backCallback,
    errorMessage: options.errorMessage,
  });
}

export function renderTariffCreatePrompt(errorMessage?: string): RenderedScreen {
  return renderInputPrompt(
    "➕ Создание тарифа",
    [
      "Введи название нового тарифа следующим сообщением.",
      "Например: <code>Премиум 30 дней</code>",
    ],
    {
      backCallback: "nav:admin_tariffs",
      errorMessage,
    },
  );
}

export function renderTariffAddSquadScreen(
  tariff: TariffDetails,
  availableSquads: RemnawaveInternalSquad[],
): RenderedScreen {
  return {
    text: renderScreenLayout("➕ Добавление сервера", {
      summary: [
        renderCodeLine("Серверов в тарифе", tariff.squads.length),
      ],
      nextStep: [
        availableSquads.length > 0
          ? "↓ Выбери сервер, который нужно добавить в тариф."
          : "• Все доступные сквады уже добавлены в тариф или список еще не синхронизирован.",
      ],
      sections: [
        renderTariffSquadsSummary(tariff).split("\n"),
      ],
    }),
    replyMarkup: buildTariffAddSquadKeyboard(tariff.id, availableSquads),
  };
}

export function renderTariffSquadScreen(
  tariff: TariffDetails,
  tariffSquadId: number,
): RenderedScreen {
  const tariffSquad = tariff.squads.find((item) => item.id === tariffSquadId);

  if (!tariffSquad) {
    return renderTariffScreen(tariff, "servers");
  }

  return {
    text: renderScreenLayout(`🛰️ Сквад тарифа: ${tariffSquad.squad.displayName ?? tariffSquad.squad.name}`, {
      summary: [
        renderCodeLine("ГБ в день", tariffSquad.trafficIncludedGbPerDay),
        renderCodeLine(
          "Стоимость 1 ГБ",
          formatMoneyMinor(tariffSquad.trafficPricePerGbMinor, tariff.currencyCode),
        ),
      ],
      nextStep: [
        "↕️ Можно изменить суточный лимит трафика или стоимость за 1 ГБ.",
      ],
      actions: [
        "⚠️ Удаление сервера уберет его из тарифа.",
      ],
    }),
    replyMarkup: buildTariffSquadKeyboard(tariff.id, tariffSquadId),
  };
}

export function renderTariffPeriodScreen(
  tariff: TariffDetails,
  tariffPeriodId: number,
): RenderedScreen {
  const tariffPeriod = tariff.periods.find((item) => item.id === tariffPeriodId);

  if (!tariffPeriod) {
    return renderTariffScreen(tariff, "duration");
  }

  return {
    text: renderScreenLayout(`📆 Период: ${tariffPeriod.durationDays} дней`, {
      summary: [
        renderCodeLine("Кол-во дней", tariffPeriod.durationDays),
        renderCodeLine(
          "Итоговая цена",
          formatMoneyMinor(
            calculateTariffPeriodPriceMinor(
              tariff.dailyPriceMinor,
              tariffPeriod.durationDays,
              tariffPeriod.discountPercent,
            ),
            tariff.currencyCode,
          ),
        ),
      ],
      nextStep: [
        "↕️ Можно изменить срок периода или процент скидки.",
      ],
      actions: [
        "⚠️ Удаление периода уберет этот вариант из каталога.",
      ],
      sections: [
        renderSection("💰 Стоимость", [
          renderCodeLine("Кол-во дней", tariffPeriod.durationDays),
          renderCodeLine(
            "Цена без скидки",
            formatMoneyMinor(
              tariff.dailyPriceMinor * tariffPeriod.durationDays,
              tariff.currencyCode,
            ),
          ),
          renderCodeLine("Скидка", `${tariffPeriod.discountPercent}%`),
          renderCodeLine(
            "Итоговая цена",
            formatMoneyMinor(
              calculateTariffPeriodPriceMinor(
                tariff.dailyPriceMinor,
                tariffPeriod.durationDays,
                tariffPeriod.discountPercent,
              ),
              tariff.currencyCode,
            ),
          ),
        ]),
      ],
    }),
    replyMarkup: buildTariffPeriodKeyboard(tariff.id, tariffPeriod.id),
  };
}
