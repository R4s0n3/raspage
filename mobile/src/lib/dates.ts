// Days are local calendar days, written YYYY-MM-DD.

const pad = (value: number) => String(value).padStart(2, "0");

export const dayKey = (date: Date = new Date()) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const parseDay = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
};

export const formatDay = (key: string) =>
  parseDay(key).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

export const formatMonth = (year: number, month: number) =>
  new Date(year, month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

// "today", "yesterday", or the date, for a friend's latest weather.
export const describeDay = (key: string) => {
  const today = dayKey();
  const yesterday = dayKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
  if (key === today) {
    return "today";
  }
  if (key === yesterday) {
    return "yesterday";
  }
  return parseDay(key).toLocaleDateString(undefined, { day: "numeric", month: "short" });
};
