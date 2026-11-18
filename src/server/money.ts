// Pure helpers: VAT codes, amounts in øre, dates and VAT terms.

export const VAT_CODES = {
  "25": { label: "25%", rate: 25, output: "2700", input: "2710" },
  "15": { label: "15%", rate: 15, output: "2701", input: "2711" },
  "12": { label: "12%", rate: 12, output: "2702", input: "2712" },
  "0": { label: "0%", rate: 0, output: null, input: null },
  exempt: { label: "Exempt", rate: 0, output: null, input: null },
} as const;

export type VatCode = keyof typeof VAT_CODES;
export const VAT_CODE_LIST = Object.keys(VAT_CODES) as VatCode[];

export function isVatCode(code: string): code is VatCode {
  return code in VAT_CODES;
}

/** Net and VAT of one invoice line, rounded to whole øre. */
export function lineAmounts(
  quantityMilli: number,
  unitPriceOre: number,
  vatCode: VatCode,
): { netOre: number; vatOre: number } {
  const netOre = Math.round((quantityMilli * unitPriceOre) / 1000);
  const vatOre = Math.round((netOre * VAT_CODES[vatCode].rate) / 100);
  return { netOre, vatOre };
}

/** Splits an amount including VAT into net and VAT. */
export function splitGross(
  grossOre: number,
  vatCode: VatCode,
): { netOre: number; vatOre: number } {
  const rate = VAT_CODES[vatCode].rate;
  const netOre = Math.round((grossOre * 100) / (100 + rate));
  return { netOre, vatOre: grossOre - netOre };
}

/** "1 234,50" or "1234.5" as øre; null when it isn't an amount. */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[\s ]/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.replace("-", "").split(".");
  const ore = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return cleaned.startsWith("-") ? -ore : ore;
}

/** A quantity such as "1,5" as thousandths; null when it isn't one. */
export function parseQuantity(text: string): number | null {
  const cleaned = text.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,3})?$/.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.split(".");
  return Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
}

/** 123450 as "1 234.50". */
export function formatOre(ore: number): string {
  const sign = ore < 0 ? "-" : "";
  const abs = Math.abs(ore);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${whole}.${String(abs % 100).padStart(2, "0")}`;
}

/** 123450 as "1234.50", for inputs and CSV. */
export function plainOre(ore: number): string {
  const sign = ore < 0 ? "-" : "";
  const abs = Math.abs(ore);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function formatQuantity(milli: number): string {
  return (milli / 1000).toString();
}

export const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Adds months, keeping the day where the month has it and the last day otherwise. */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

export const INTERVALS = ["weekly", "monthly", "quarterly", "yearly"] as const;
export type Interval = (typeof INTERVALS)[number];

export function nextRun(date: string, interval: Interval): string {
  switch (interval) {
    case "weekly":
      return addDays(date, 7);
    case "monthly":
      return addMonths(date, 1);
    case "quarterly":
      return addMonths(date, 3);
    case "yearly":
      return addMonths(date, 12);
  }
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** A two-month VAT term (1 = Jan–Feb ... 6 = Nov–Dec) with its filing deadline. */
export function vatTerm(year: number, term: number) {
  const startMonth = (term - 1) * 2 + 1;
  const from = `${year}-${String(startMonth).padStart(2, "0")}-01`;
  const to = addDays(addMonths(from, 2), -1);
  const deadlines: Record<number, string> = {
    1: `${year}-04-10`,
    2: `${year}-06-10`,
    3: `${year}-08-31`,
    4: `${year}-10-10`,
    5: `${year}-12-10`,
    6: `${year + 1}-02-10`,
  };
  return {
    year,
    term,
    label: `${MONTHS[startMonth - 1]}–${MONTHS[startMonth]} ${year}`,
    from,
    to,
    deadline: deadlines[term]!,
  };
}

export function termOf(date: string): { year: number; term: number } {
  const [y, m] = date.split("-").map(Number) as [number, number];
  return { year: y, term: Math.ceil(m / 2) };
}

/** The next VAT filing deadlines on or after a date. */
export function upcomingVatDeadlines(from: string, count: number) {
  const { year } = termOf(from);
  const all = [year - 1, year, year + 1].flatMap((y) =>
    [1, 2, 3, 4, 5, 6].map((t) => vatTerm(y, t)),
  );
  return all.filter((t) => t.deadline >= from).slice(0, count);
}
