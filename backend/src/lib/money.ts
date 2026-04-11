const MINOR_UNITS_SCALE = 100n;

export function parseAmountToMinorUnits(value: number | string): number {
  const raw = typeof value === "number" ? value.toString() : value;
  const trimmed = raw.trim();

  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error("Amount must be a valid positive number with up to 2 decimal places.");
  }

  const [whole, fraction = ""] = trimmed.split(".");
  const minorUnits = BigInt(whole) * MINOR_UNITS_SCALE + BigInt((fraction + "00").slice(0, 2));

  if (minorUnits <= 0n) {
    throw new Error("Amount must be greater than zero.");
  }

  if (minorUnits > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Amount is too large.");
  }

  return Number(minorUnits);
}

export function formatMinorUnits(value: number): string {
  const whole = Math.trunc(value / 100);
  const fraction = Math.abs(value % 100)
    .toString()
    .padStart(2, "0");

  return `${whole}.${fraction}`;
}