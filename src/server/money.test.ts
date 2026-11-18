import { describe, expect, it } from "vitest";
import {
  addMonths,
  formatOre,
  lineAmounts,
  nextRun,
  parseAmount,
  parseQuantity,
  splitGross,
  upcomingVatDeadlines,
  vatTerm,
} from "./money";

describe("money", () => {
  it("computes line net and VAT in whole øre", () => {
    expect(lineAmounts(1500, 99999, "25")).toEqual({ netOre: 149999, vatOre: 37500 });
    expect(lineAmounts(1000, 10000, "exempt")).toEqual({ netOre: 10000, vatOre: 0 });
  });
  it("splits an amount including VAT", () => {
    expect(splitGross(12500, "25")).toEqual({ netOre: 10000, vatOre: 2500 });
    expect(splitGross(11200, "12")).toEqual({ netOre: 10000, vatOre: 1200 });
  });
  it("parses and formats amounts", () => {
    expect(parseAmount("1 234,5")).toBe(123450);
    expect(parseAmount("12.345")).toBeNull();
    expect(parseQuantity("1,5")).toBe(1500);
    expect(formatOre(123456789)).toBe("1 234 567.89");
    expect(formatOre(-5)).toBe("-0.05");
  });
  it("advances recurring dates", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(nextRun("2026-03-15", "quarterly")).toBe("2026-06-15");
    expect(nextRun("2026-03-15", "weekly")).toBe("2026-03-22");
  });
  it("knows VAT terms and deadlines", () => {
    expect(vatTerm(2026, 1)).toMatchObject({ from: "2026-01-01", to: "2026-02-28", deadline: "2026-04-10" });
    expect(vatTerm(2026, 6).deadline).toBe("2027-02-10");
    expect(upcomingVatDeadlines("2026-04-11", 1)[0]!.term).toBe(2);
  });
});
