import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/client/components/ui/native-select";
import { Amount } from "@/client/lib/format";
import {
  VAT_CODES,
  VAT_CODE_LIST,
  lineAmounts,
  parseAmount,
  parseQuantity,
  plainOre,
  formatQuantity,
  type VatCode,
} from "@/server/money";

export interface LineDraft {
  description: string;
  quantity: string;
  unitPrice: string;
  vatCode: string;
  accountNumber: string;
}

export interface LineValue {
  description: string;
  quantityMilli: number;
  unitPriceOre: number;
  vatCode: string;
  accountNumber: string;
}

export function emptyLine(vatRegistered: boolean): LineDraft {
  return {
    description: "",
    quantity: "1",
    unitPrice: "",
    vatCode: vatRegistered ? "25" : "exempt",
    accountNumber: vatRegistered ? "3000" : "3200",
  };
}

export function toDrafts(lines: LineValue[]): LineDraft[] {
  return lines.map((l) => ({
    description: l.description,
    quantity: formatQuantity(l.quantityMilli),
    unitPrice: plainOre(l.unitPriceOre),
    vatCode: l.vatCode,
    accountNumber: l.accountNumber,
  }));
}

/** The lines as the server takes them, or the first problem. */
export function parseLines(lines: LineDraft[]): LineValue[] | string {
  const out: LineValue[] = [];
  for (const [i, l] of lines.entries()) {
    const quantityMilli = parseQuantity(l.quantity);
    const unitPriceOre = parseAmount(l.unitPrice);
    if (!l.description.trim()) return `Line ${i + 1} needs a description.`;
    if (!quantityMilli) return `Line ${i + 1} needs a quantity.`;
    if (unitPriceOre === null || unitPriceOre < 0) return `Line ${i + 1} needs a price.`;
    out.push({
      description: l.description.trim(),
      quantityMilli,
      unitPriceOre,
      vatCode: l.vatCode,
      accountNumber: l.accountNumber,
    });
  }
  return out.length ? out : "Add at least one line.";
}

function amountsOf(l: LineDraft) {
  const q = parseQuantity(l.quantity) ?? 0;
  const p = parseAmount(l.unitPrice) ?? 0;
  const code = (l.vatCode in VAT_CODES ? l.vatCode : "exempt") as VatCode;
  return lineAmounts(q, p, code);
}

export function LinesEditor({
  lines,
  onChange,
  incomeAccounts,
  vatRegistered,
}: {
  lines: LineDraft[];
  onChange: (lines: LineDraft[]) => void;
  incomeAccounts: { number: string; name: string }[];
  vatRegistered: boolean;
}) {
  const set = (i: number, change: Partial<LineDraft>) =>
    onChange(lines.map((l, j) => (j === i ? { ...l, ...change } : l)));
  const codes = vatRegistered ? VAT_CODE_LIST : (["exempt"] as const);
  const totals = lines.map(amountsOf).reduce(
    (s, a) => ({ net: s.net + a.netOre, vat: s.vat + a.vatOre }),
    { net: 0, vat: 0 },
  );
  return (
    <div className="space-y-3">
      {lines.map((line, i) => (
        <div
          key={i}
          className="grid grid-cols-2 gap-2 rounded-lg border border-border p-3 md:grid-cols-[1fr_5rem_7rem_6rem_10rem_6rem_auto] md:items-end md:border-0 md:p-0"
        >
          <Input
            aria-label={`Line ${i + 1} description`}
            data-testid={`line-description-${i}`}
            placeholder="Description"
            className="col-span-2 md:col-span-1"
            value={line.description}
            onChange={(e) => set(i, { description: e.target.value })}
          />
          <Input
            aria-label={`Line ${i + 1} quantity`}
            data-testid={`line-quantity-${i}`}
            inputMode="decimal"
            value={line.quantity}
            onChange={(e) => set(i, { quantity: e.target.value })}
          />
          <Input
            aria-label={`Line ${i + 1} unit price excluding VAT`}
            data-testid={`line-price-${i}`}
            inputMode="decimal"
            placeholder="Price excl. VAT"
            value={line.unitPrice}
            onChange={(e) => set(i, { unitPrice: e.target.value })}
          />
          <NativeSelect
            aria-label={`Line ${i + 1} VAT`}
            data-testid={`line-vat-${i}`}
            value={line.vatCode}
            onChange={(e) => set(i, { vatCode: e.target.value })}
          >
            {codes.map((code) => (
              <NativeSelectOption key={code} value={code}>
                VAT {VAT_CODES[code].label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label={`Line ${i + 1} income account`}
            data-testid={`line-account-${i}`}
            value={line.accountNumber}
            onChange={(e) => set(i, { accountNumber: e.target.value })}
          >
            {incomeAccounts.map((a) => (
              <NativeSelectOption key={a.number} value={a.number}>
                {a.number} {a.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <div className="self-center text-right text-sm">
            <Amount ore={amountsOf(line).netOre} />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove line ${i + 1}`}
            disabled={lines.length === 1}
            onClick={() => onChange(lines.filter((_, j) => j !== i))}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...lines, emptyLine(vatRegistered)])}
        >
          <Plus /> Add line
        </Button>
        <dl className="grid grid-cols-[auto_8rem] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Net</dt>
          <dd className="text-right"><Amount ore={totals.net} /></dd>
          <dt className="text-muted-foreground">VAT</dt>
          <dd className="text-right"><Amount ore={totals.vat} /></dd>
          <dt className="font-medium">Total NOK</dt>
          <dd className="text-right font-medium" data-testid="form-total">
            <Amount ore={totals.net + totals.vat} />
          </dd>
        </dl>
      </div>
    </div>
  );
}
