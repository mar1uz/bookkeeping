import { Badge } from "@/client/components/ui/badge";
import { formatOre } from "@/server/money";

export { formatOre };

export function Amount({ ore, className }: { ore: number; className?: string }) {
  return <span className={`tabular-nums ${className ?? ""}`}>{formatOre(ore)}</span>;
}

const STATUS: Record<string, { label: string; variant: "default" | "soft" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Draft", variant: "outline" },
  unpaid: { label: "Unpaid", variant: "secondary" },
  partly_paid: { label: "Partly paid", variant: "soft" },
  overdue: { label: "Overdue", variant: "destructive" },
  paid: { label: "Paid", variant: "default" },
  credited: { label: "Credited", variant: "outline" },
  credit_note: { label: "Credit note", variant: "outline" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, variant: "outline" as const };
  return (
    <Badge variant={s.variant} data-testid="status">
      {s.label}
    </Badge>
  );
}

export const STATUS_LABELS = Object.fromEntries(
  Object.entries(STATUS).map(([k, v]) => [k, v.label]),
);

export function errorMessage(cause: unknown): string {
  if (cause instanceof Error) {
    // A validation failure arrives as the zod issues in JSON.
    try {
      const issues = JSON.parse(cause.message) as { message?: string }[];
      if (Array.isArray(issues) && issues[0]?.message) return issues[0].message;
    } catch {
      // Not JSON: the message is the sentence.
    }
    return cause.message;
  }
  return "That didn't work.";
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const SOURCE_LABELS: Record<string, string> = {
  invoice: "Invoice",
  credit_note: "Credit note",
  payment: "Payment",
  purchase: "Purchase",
  purchase_payment: "Bill payment",
  purchase_reversal: "Purchase deleted",
  purchase_payment_reversal: "Bill payment deleted",
  manual: "Manual entry",
};
