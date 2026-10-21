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
