import { Input } from "@/client/components/ui/input";

export function PeriodPicker({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (p: { from: string; to: string }) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input type="date" aria-label="From" data-testid="period-from" className="w-auto bg-card" value={from} onChange={(e) => e.target.value && onChange({ from: e.target.value, to })} />
      <span className="text-sm text-muted-foreground">to</span>
      <Input type="date" aria-label="To" data-testid="period-to" className="w-auto bg-card" value={to} onChange={(e) => e.target.value && onChange({ from, to: e.target.value })} />
    </div>
  );
}

export function yearStart(): string {
  return `${new Date().getUTCFullYear()}-01-01`;
}
export function yearEnd(): string {
  return `${new Date().getUTCFullYear()}-12-31`;
}
