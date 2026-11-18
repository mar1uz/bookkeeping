import { Amount } from "@/client/lib/format";
import { formatQuantity } from "@/server/money";
import { VAT_CODES, type VatCode } from "@/server/money";

export interface InvoiceDoc {
  kind: string;
  number: number | null;
  issueDate: string;
  dueDate: string;
  netOre: number;
  vatOre: number;
  grossOre: number;
  paidOre: number;
  related: { number: number | null } | null;
  customer: { name: string; orgNumber: string; address: string };
  company: { name: string; orgNumber: string; address: string; bankAccount: string; vatRegistered: boolean };
  lines: { description: string; quantityMilli: number; unitPriceOre: number; vatCode: string; netOre: number }[];
  vat: { code: string; label: string; base: number; vat: number }[];
}

/** The invoice as the customer sees it, on screen and on paper. */
export function InvoiceDocument({ doc }: { doc: InvoiceDoc }) {
  const credit = doc.kind === "credit_note";
  const title = credit ? "Credit note" : "Invoice";
  return (
    <article
      data-testid="invoice-document"
      className="space-y-8 rounded-xl border border-border bg-card p-6 text-card-foreground md:p-10 print:border-0 print:p-0"
    >
      <header className="flex flex-wrap justify-between gap-6">
        <div className="space-y-1">
          <p className="text-lg font-semibold">{doc.company.name}</p>
          {doc.company.address ? (
            <p className="text-sm whitespace-pre-line text-muted-foreground">{doc.company.address}</p>
          ) : null}
          {doc.company.orgNumber ? (
            <p className="text-sm text-muted-foreground">
              Org. no. {doc.company.orgNumber}
              {doc.company.vatRegistered ? " MVA" : ""}
            </p>
          ) : null}
        </div>
        <div className="space-y-1 text-right">
          <h1 className="text-2xl font-semibold tracking-tight">
            {title} {doc.number ?? "(draft)"}
          </h1>
          {doc.related ? (
            <p className="text-sm text-muted-foreground">
              {credit ? `Cancels invoice ${doc.related.number}` : `Cancelled by credit note ${doc.related.number}`}
            </p>
          ) : null}
        </div>
      </header>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase">Bill to</p>
          <p className="font-medium">{doc.customer.name}</p>
          {doc.customer.address ? (
            <p className="text-sm whitespace-pre-line">{doc.customer.address}</p>
          ) : null}
          {doc.customer.orgNumber ? (
            <p className="text-sm text-muted-foreground">Org. no. {doc.customer.orgNumber}</p>
          ) : null}
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm sm:justify-self-end">
          <dt className="text-muted-foreground">Date</dt>
          <dd>{doc.issueDate}</dd>
          {!credit ? (
            <>
              <dt className="text-muted-foreground">Due</dt>
              <dd>{doc.dueDate}</dd>
              {doc.company.bankAccount ? (
                <>
                  <dt className="text-muted-foreground">Pay to account</dt>
                  <dd>{doc.company.bankAccount}</dd>
                </>
              ) : null}
            </>
          ) : null}
        </dl>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="py-2 font-medium">Description</th>
            <th className="py-2 text-right font-medium">Qty</th>
            <th className="py-2 text-right font-medium">Unit price</th>
            <th className="py-2 text-right font-medium">VAT</th>
            <th className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((l, i) => (
            <tr key={i} className="border-b border-border">
              <td className="py-2">{l.description}</td>
              <td className="py-2 text-right tabular-nums">{formatQuantity(l.quantityMilli)}</td>
              <td className="py-2 text-right"><Amount ore={l.unitPriceOre} /></td>
              <td className="py-2 text-right">{VAT_CODES[l.vatCode as VatCode]?.label ?? l.vatCode}</td>
              <td className="py-2 text-right"><Amount ore={l.netOre} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="ml-auto grid w-full max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Net</dt>
        <dd className="text-right"><Amount ore={doc.netOre} /></dd>
        {doc.vat
          .filter((v) => v.vat !== 0)
          .map((v) => (
            <div key={v.code} className="contents">
              <dt className="text-muted-foreground">VAT {v.label} of <Amount ore={v.base} /></dt>
              <dd className="text-right"><Amount ore={v.vat} /></dd>
            </div>
          ))}
        <dt className="border-t border-border pt-2 font-semibold">Total NOK</dt>
        <dd className="border-t border-border pt-2 text-right font-semibold" data-testid="invoice-total">
          <Amount ore={doc.grossOre} />
        </dd>
        {!credit && doc.paidOre > 0 ? (
          <>
            <dt className="text-muted-foreground">Paid</dt>
            <dd className="text-right"><Amount ore={doc.paidOre} /></dd>
            <dt className="font-medium">Balance</dt>
            <dd className="text-right font-medium"><Amount ore={doc.grossOre - doc.paidOre} /></dd>
          </>
        ) : null}
      </dl>
    </article>
  );
}
