export function getJapanDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [year, month, day] = formatter.format(date).split("-").map(Number);
  return { year, month, day };
}

export function getJapanBoundaryIso(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day) - 9 * 60 * 60 * 1000).toISOString();
}

export function formatJapanDateLabel(dateIso: string) {
  const date = new Date(dateIso);
  const formatter = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });
  return formatter.format(date);
}

export function formatJapanTime(dateIso: string) {
  const date = new Date(dateIso);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function getJapanDateKey(dateIso: string) {
  const { year, month, day } = getJapanDateParts(new Date(dateIso));
  return `${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export function getDateKey(year: number, month: number, day: number) {
  return `${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export function addDaysToJapanDate(
  year: number,
  month: number,
  day: number,
  offset: number,
) {
  const date = new Date(Date.UTC(year, month - 1, day + offset));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}
