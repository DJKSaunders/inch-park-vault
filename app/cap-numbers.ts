import capData from "../public/data/cap-numbers.json";

type CapEntry = {
  capNumber: number;
  displayName: string;
  playerId: string;
};

function normaliseCapLookup(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export const capTooltip = capData.tooltip;

export function capEntryForPlayerId(playerId: string | null | undefined) {
  if (!playerId) return null;
  return (capData.byPlayerId as Record<string, CapEntry>)[playerId] ?? null;
}

export function capEntryForName(name: string | null | undefined) {
  if (!name) return null;
  return (
    (capData.byName as Record<string, CapEntry>)[normaliseCapLookup(name)] ?? null
  );
}

export function capSearchNumber(value: string) {
  const match = value.trim().match(/^#?(?:cap\s*)?#?(\d+)$/i);
  return match ? Number(match[1]) : null;
}

export function capEntryForNumber(capNumber: number | null) {
  if (capNumber === null) return null;
  return (
    Object.values(capData.byPlayerId as Record<string, CapEntry>).find(
      (entry) => entry.capNumber === capNumber,
    ) ?? null
  );
}
