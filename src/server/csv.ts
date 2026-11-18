import * as ledger from "./ledger";
import { plainOre } from "./money";

function csv(rows: (string | number)[][]): string {
  return rows
    .map((r) =>
      r
        .map((v) => {
          const s = String(v);
          return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\r\n");
}

/** A report as CSV: its file name and body. Null for an unknown report. */
export async function reportCsv(
  report: string,
  q: URLSearchParams,
): Promise<{ name: string; body: string } | null> {
  const from = q.get("from") ?? "";
  const to = q.get("to") ?? "";
  switch (report) {
    case "journal": {
      const vouchers = await ledger.journal(ledger.periodInput.parse({ from, to }));
      const rows: (string | number)[][] = [
        ["Voucher", "Date", "Description", "Account", "Account name", "Debit", "Credit", "VAT code"],
      ];
      for (const v of [...vouchers].reverse()) {
        for (const l of v.lines) {
          rows.push([v.number, v.date, v.description, l.account, l.accountName ?? "", plainOre(l.debit), plainOre(l.credit), l.vatCode ?? ""]);
        }
      }
      return { name: `journal-${from}-${to}.csv`, body: csv(rows) };
    }
    case "ledger": {
      const account = q.get("account") ?? "";
      const g = await ledger.generalLedger(ledger.ledgerInput.parse({ from, to, account }));
      const rows: (string | number)[][] = [
        ["Date", "Voucher", "Description", "Debit", "Credit", "Balance"],
        [from, "", "Opening balance", "", "", plainOre(g.openingBalance)],
        ...g.lines.map((l) => [l.date, l.number, l.description, plainOre(l.debit), plainOre(l.credit), plainOre(l.balance)]),
      ];
      return { name: `ledger-${account}-${from}-${to}.csv`, body: csv(rows) };
    }
    case "profit-and-loss": {
      const p = await ledger.profitAndLoss(ledger.periodInput.parse({ from, to }));
      const rows: (string | number)[][] = [
        ["Section", "Account", "Name", "Amount"],
        ...p.income.map((r) => ["Income", r.number, r.name, plainOre(r.amount)]),
        ["Income", "", "Total income", plainOre(p.totalIncome)],
        ...p.expenses.map((r) => ["Costs", r.number, r.name, plainOre(r.amount)]),
        ["Costs", "", "Total costs", plainOre(p.totalExpenses)],
        ["Result", "", "Result", plainOre(p.result)],
      ];
      return { name: `profit-and-loss-${from}-${to}.csv`, body: csv(rows) };
    }
    case "balance-sheet": {
      const b = await ledger.balanceSheet(ledger.asOfInput.parse({ to }));
      const rows: (string | number)[][] = [
        ["Section", "Account", "Name", "Amount"],
        ...b.assets.map((r) => ["Assets", r.number, r.name, plainOre(r.amount)]),
        ["Assets", "", "Total assets", plainOre(b.totalAssets)],
        ...b.equity.map((r) => ["Equity", r.number, r.name, plainOre(r.amount)]),
        ["Equity", "", "Result not yet closed", plainOre(b.result)],
        ["Equity", "", "Total equity", plainOre(b.totalEquity)],
        ...b.liabilities.map((r) => ["Liabilities", r.number, r.name, plainOre(r.amount)]),
        ["Liabilities", "", "Total liabilities", plainOre(b.totalLiabilities)],
      ];
      return { name: `balance-sheet-${to}.csv`, body: csv(rows) };
    }
    case "vat": {
      const v = await ledger.vatReport(
        ledger.vatInput.parse({ year: Number(q.get("year")), term: Number(q.get("term")) }),
      );
      const rows: (string | number)[][] = [
        ["Term", v.label, "Deadline", v.deadline],
        ["Kind", "VAT code", "Base", "VAT"],
        ...v.sales.map((r) => ["Sales", r.label, plainOre(r.base), plainOre(r.vat)]),
        ...v.purchases.map((r) => ["Purchases", r.label, plainOre(r.base), plainOre(r.vat)]),
        ["Output VAT", "", "", plainOre(v.outputVat)],
        ["Input VAT", "", "", plainOre(v.inputVat)],
        [v.payable >= 0 ? "To pay" : "To get back", "", "", plainOre(Math.abs(v.payable))],
      ];
      return { name: `vat-${v.year}-term-${v.term}.csv`, body: csv(rows) };
    }
    default:
      return null;
  }
}
