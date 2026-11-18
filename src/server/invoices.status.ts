import { today } from "./money";

export type InvoiceStatus =
  | "draft"
  | "unpaid"
  | "partly_paid"
  | "overdue"
  | "paid"
  | "credited"
  | "credit_note";

export function statusOf(
  i: { kind: string; state: string; dueDate: string; grossOre: number; paidOre: number },
  on = today(),
): InvoiceStatus {
  if (i.kind === "credit_note") return "credit_note";
  if (i.state === "draft") return "draft";
  if (i.state === "credited") return "credited";
  const balance = i.grossOre - i.paidOre;
  if (balance <= 0) return "paid";
  if (i.dueDate < on) return "overdue";
  return i.paidOre > 0 ? "partly_paid" : "unpaid";
}
