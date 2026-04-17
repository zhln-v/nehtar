export function formatMoneyMinor(valueMinor: number, currencyCode: string) {
  const value = valueMinor / 100;

  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
