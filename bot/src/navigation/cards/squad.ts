import { htmlCode } from "../../formatters/html.js";
import { formatMoneyMinor } from "../../services/pricing-format-service.js";
import type { RemnawaveInternalSquad } from "../../generated/prisma/index.js";
import {
  buildSquadDetailsKeyboard,
  buildSquadInputKeyboard,
  buildSquadUnitKeyboard,
} from "../ui/keyboards.js";
import { renderScreenLayout, renderSection } from "../ui/text.js";
import type { RenderedScreen } from "../screens/types.js";

export function renderInternalSquadScreen(
  squad: RemnawaveInternalSquad,
  currencyCode: string,
): RenderedScreen {
  return {
    text: renderScreenLayout(`🛰️ Сквад: ${squad.name}`, {
      summary: [
        `Название для пользователя: ${htmlCode(squad.displayName ?? squad.name)}`,
        `Позиция: ${htmlCode(squad.viewPosition)}`,
      ],
      nextStep: [
        "↕️ Измени отображаемое название, себестоимость или единицу измерения кнопками ниже.",
      ],
      sections: [
        renderSection("🎛️ Отображение", [
          `Название для пользователя: ${htmlCode(squad.displayName ?? squad.name)}`,
          `Позиция: ${htmlCode(squad.viewPosition)}`,
        ]),
        renderSection("🧩 Технические данные", [
          `UUID: ${htmlCode(squad.uuid)}`,
          `Участников: ${htmlCode(squad.membersCount)}`,
          `Inbound'ов: ${htmlCode(squad.inboundsCount)}`,
        ]),
        renderSection("💸 Себестоимость трафика", [
          `Единица измерения: ${htmlCode(squad.trafficPriceUnit)}`,
          `Себестоимость за 1 ${squad.trafficPriceUnit}: ${htmlCode(formatMoneyMinor(squad.trafficPricePerGbMinor, currencyCode))}`,
        ]),
      ],
    }),
    replyMarkup: buildSquadDetailsKeyboard(squad.uuid),
  };
}

export function renderSquadUnitPrompt(
  squad: RemnawaveInternalSquad,
  currencyCode: string,
): RenderedScreen {
  return {
    text: renderScreenLayout(`📏 Сквад: ${squad.name}`, {
      summary: [
        `Единица измерения: ${htmlCode(squad.trafficPriceUnit)}`,
        `Себестоимость за 1 ${squad.trafficPriceUnit}: ${htmlCode(formatMoneyMinor(squad.trafficPricePerGbMinor, currencyCode))}`,
      ],
      nextStep: [
        "↓ Выбери единицу измерения трафика кнопками ниже.",
      ],
      sections: [
        renderSection("📍 Текущее значение", [
          `Единица измерения: ${htmlCode(squad.trafficPriceUnit)}`,
          `Себестоимость за 1 ${squad.trafficPriceUnit}: ${htmlCode(formatMoneyMinor(squad.trafficPricePerGbMinor, currencyCode))}`,
        ]),
      ],
    }),
    replyMarkup: buildSquadUnitKeyboard(squad.uuid),
  };
}

export function renderSquadInputPrompt(
  squad: RemnawaveInternalSquad,
  type: "display_name" | "traffic_price",
): RenderedScreen {
  const text = type === "display_name"
    ? renderScreenLayout(`✏️ Сквад: ${squad.name}`, {
        summary: [
          `Название для пользователя: ${htmlCode(squad.displayName ?? squad.name)}`,
        ],
        nextStep: [
          "↓ Введи новым сообщением название, которое будет видеть пользователь.",
        ],
        actions: [
          "↩️ Отправь <code>-</code>, чтобы вернуть системное название сквада.",
        ],
        sections: [
          renderSection("📍 Текущее значение", [
            `Название для пользователя: ${htmlCode(squad.displayName ?? squad.name)}`,
          ]),
        ],
      })
    : renderScreenLayout(`💸 Сквад: ${squad.name}`, {
        nextStep: [
          `↓ Введи новым сообщением себестоимость за 1 ${squad.trafficPriceUnit} для этого сквада.`,
        ],
        actions: [
          "✍️ Пример: <code>49.90</code>",
        ],
        sections: [
          renderSection("📝 Что сделать", [
            `Введи новым сообщением себестоимость за 1 ${squad.trafficPriceUnit} для этого сквада.`,
            "Пример: <code>49.90</code>",
          ]),
        ],
      });

  return {
    text,
    replyMarkup: buildSquadInputKeyboard(squad.uuid),
  };
}
