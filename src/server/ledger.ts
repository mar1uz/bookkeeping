import { and, asc, desc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { z } from "zod";
import { db } from "@/db";
import { accounts, counters, entries, payments, users, vouchers } from "@/db/schema";
import { assertActiveAccount, assertOpen, type Actor } from "./books";
import { refuse } from "./errors";
import { DATE, VAT_CODES, VAT_CODE_LIST, isVatCode, vatTerm } from "./money";

export type Statement = BatchItem<"sqlite">;

export interface PostingLine {
  account: string;
  debit: number;
  credit: number;
  vatCode?: string | null;
  description?: string;
}

/**
 * The statements that post one balanced voucher with the next number. Run
 * them in one db.batch() with the source's own change: D1 runs a batch as a
 * transaction, and the unique source index refuses a second posting.
 */
export function postVoucher(v: {
  id?: string;
  date: string;
  description: string;
  sourceType: string;
  sourceId: string;
  createdBy: string;
  lines: PostingLine[];
}): Statement[] {
  const lines = v.lines.filter((l) => l.debit !== 0 || l.credit !== 0);
  const debit = lines.reduce((s, l) => s + l.debit, 0);
  const credit = lines.reduce((s, l) => s + l.credit, 0);
  if (debit !== credit) refuse("Debit and credit must be equal.");
  if (lines.length < 2) refuse("An entry needs at least two lines.");
  const voucherId = v.id ?? crypto.randomUUID();
  return [
    db
      .update(counters)
      .set({ value: sql`${counters.value} + 1` })
      .where(eq(counters.name, "voucher")),
    db.insert(vouchers).values({
      id: voucherId,
      number: sql`(select value from counters where name = 'voucher')`,
      date: v.date,
      description: v.description,
      sourceType: v.sourceType,
      sourceId: v.sourceId,
      createdBy: v.createdBy,
    }),
    db.insert(entries).values(
      lines.map((l) => ({
        id: crypto.randomUUID(),
        voucherId,
        accountNumber: l.account,
        debitOre: l.debit,
        creditOre: l.credit,
        vatCode: l.vatCode ?? null,
        description: l.description ?? "",
      })),
    ),
  ];
}

export async function runBatch(statements: Statement[]) {
  const [first, ...rest] = statements;
  if (!first) return;
  await db.batch([first, ...rest]);
}

/** The voucher posted for a source, if any. */
export async function voucherFor(sourceType: string, sourceId: string) {
  const [row] = await db
    .select({ id: vouchers.id, number: vouchers.number, date: vouchers.date })
    .from(vouchers)
    .where(
      and(eq(vouchers.sourceType, sourceType), eq(vouchers.sourceId, sourceId)),
    );
  return row ?? null;
}

// Manual entries

export const manualEntryInput = z.object({
  date: z.string().regex(DATE, "Pick a date"),
  description: z.string().trim().min(1, "Enter a description").max(300),
  lines: z
    .array(
      z.object({
        account: z.string().regex(/^\d{4}$/, "Pick an account"),
        debit: z.number().int().min(0),
        credit: z.number().int().min(0),
        vatCode: z.string().nullable().optional(),
        description: z.string().trim().max(300).optional(),
      }),
    )
    .min(2, "An entry needs at least two lines")
    .max(100),
});

export async function createManualEntry(
  actor: Actor,
  input: z.infer<typeof manualEntryInput>,
) {
  await assertOpen(input.date);
  for (const line of input.lines) {
    if ((line.debit > 0) === (line.credit > 0)) {
      refuse("Each line has either a debit or a credit amount.");
    }
    if (line.vatCode && !isVatCode(line.vatCode)) refuse("Unknown VAT code.");
    await assertActiveAccount(line.account);
  }
  const id = crypto.randomUUID();
  await runBatch(
    postVoucher({
      id,
      date: input.date,
      description: input.description,
      sourceType: "manual",
      sourceId: id,
      createdBy: actor.id,
      lines: input.lines,
    }),
  );
  return { id };
}

// Journal and general ledger

export const periodInput = z.object({
  from: z.string().regex(DATE),
  to: z.string().regex(DATE),
});

export async function journal(input: z.infer<typeof periodInput>) {
  const list = await db
    .select({
      id: vouchers.id,
      number: vouchers.number,
      date: vouchers.date,
      description: vouchers.description,
      sourceType: vouchers.sourceType,
      sourceId: vouchers.sourceId,
      createdBy: users.email,
      paymentInvoiceId: payments.invoiceId,
    })
    .from(vouchers)
    .leftJoin(users, eq(users.id, vouchers.createdBy))
    .leftJoin(payments, eq(payments.id, vouchers.sourceId))
    .where(and(gte(vouchers.date, input.from), lte(vouchers.date, input.to)))
    .orderBy(desc(vouchers.date), desc(vouchers.number))
    .limit(500);
  const ids = list.map((v) => v.id);
  const lines = ids.length
    ? await db
        .select({
          voucherId: entries.voucherId,
          account: entries.accountNumber,
          accountName: accounts.name,
          debit: entries.debitOre,
          credit: entries.creditOre,
          vatCode: entries.vatCode,
        })
        .from(entries)
        .leftJoin(accounts, eq(accounts.number, entries.accountNumber))
        .where(inArray(entries.voucherId, ids))
        .orderBy(asc(entries.accountNumber))
    : [];
  return list.map((v) => ({
    ...v,
    lines: lines.filter((l) => l.voucherId === v.id),
  }));
}

/** Balance with the account's natural sign: debit-positive for assets and costs. */
function signed(type: string, debit: number, credit: number): number {
  return type === "asset" || type === "expense" ? debit - credit : credit - debit;
}

export const ledgerInput = periodInput.extend({
  account: z.string().regex(/^\d{4}$/),
});

export async function generalLedger(input: z.infer<typeof ledgerInput>) {
  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.number, input.account));
  if (!account) refuse("No such account.");
  const [opening] = await db
    .select({
      debit: sql<number>`coalesce(sum(${entries.debitOre}), 0)`,
      credit: sql<number>`coalesce(sum(${entries.creditOre}), 0)`,
    })
    .from(entries)
    .innerJoin(vouchers, eq(vouchers.id, entries.voucherId))
    .where(
      and(eq(entries.accountNumber, input.account), lt(vouchers.date, input.from)),
    );
  const rows = await db
    .select({
      voucherId: vouchers.id,
      number: vouchers.number,
      date: vouchers.date,
      description: vouchers.description,
      sourceType: vouchers.sourceType,
      sourceId: vouchers.sourceId,
      debit: entries.debitOre,
      credit: entries.creditOre,
    })
    .from(entries)
    .innerJoin(vouchers, eq(vouchers.id, entries.voucherId))
    .where(
      and(
        eq(entries.accountNumber, input.account),
        gte(vouchers.date, input.from),
        lte(vouchers.date, input.to),
      ),
    )
    .orderBy(asc(vouchers.date), asc(vouchers.number));
  const openingBalance = signed(
    account.type,
    Number(opening?.debit ?? 0),
    Number(opening?.credit ?? 0),
  );
  let running = openingBalance;
  const lines = rows.map((r) => {
    running += signed(account.type, r.debit, r.credit);
    return { ...r, balance: running };
  });
  return { account, openingBalance, closingBalance: running, lines };
}

// Statements

async function balancesBetween(from: string | null, to: string) {
  const rows = await db
    .select({
      number: accounts.number,
      name: accounts.name,
      type: accounts.type,
      debit: sql<number>`coalesce(sum(${entries.debitOre}), 0)`,
      credit: sql<number>`coalesce(sum(${entries.creditOre}), 0)`,
    })
    .from(entries)
    .innerJoin(vouchers, eq(vouchers.id, entries.voucherId))
    .innerJoin(accounts, eq(accounts.number, entries.accountNumber))
    .where(
      from
        ? and(gte(vouchers.date, from), lte(vouchers.date, to))
        : lte(vouchers.date, to),
    )
    .groupBy(accounts.number)
    .orderBy(accounts.number);
  return rows
    .map((r) => ({
      number: r.number,
      name: r.name,
      type: r.type,
      amount: signed(r.type, Number(r.debit), Number(r.credit)),
    }))
    .filter((r) => r.amount !== 0);
}

export async function profitAndLoss(input: z.infer<typeof periodInput>) {
  const rows = await balancesBetween(input.from, input.to);
  const income = rows.filter((r) => r.type === "income");
  const expenses = rows.filter((r) => r.type === "expense");
  const totalIncome = income.reduce((s, r) => s + r.amount, 0);
  const totalExpenses = expenses.reduce((s, r) => s + r.amount, 0);
  return {
    ...input,
    income,
    expenses,
    totalIncome,
    totalExpenses,
    result: totalIncome - totalExpenses,
  };
}

export const asOfInput = z.object({ to: z.string().regex(DATE) });

export async function balanceSheet(input: z.infer<typeof asOfInput>) {
  const rows = await balancesBetween(null, input.to);
  const assets = rows.filter((r) => r.type === "asset");
  const equity = rows.filter((r) => r.type === "equity");
  const liabilities = rows.filter((r) => r.type === "liability");
  // Income and costs not yet closed into equity: the result so far.
  const result = rows
    .filter((r) => r.type === "income" || r.type === "expense")
    .reduce((s, r) => s + (r.type === "income" ? r.amount : -r.amount), 0);
  const totalAssets = assets.reduce((s, r) => s + r.amount, 0);
  const totalEquity = equity.reduce((s, r) => s + r.amount, 0) + result;
  const totalLiabilities = liabilities.reduce((s, r) => s + r.amount, 0);
  return {
    to: input.to,
    assets,
    equity,
    liabilities,
    result,
    totalAssets,
    totalEquity,
    totalLiabilities,
  };
}

export const vatInput = z.object({
  year: z.number().int().min(2000).max(2100),
  term: z.number().int().min(1).max(6),
});

export async function vatReport(input: z.infer<typeof vatInput>) {
  const term = vatTerm(input.year, input.term);
  const rows = await db
    .select({
      account: entries.accountNumber,
      type: accounts.type,
      vatCode: entries.vatCode,
      debit: sql<number>`coalesce(sum(${entries.debitOre}), 0)`,
      credit: sql<number>`coalesce(sum(${entries.creditOre}), 0)`,
    })
    .from(entries)
    .innerJoin(vouchers, eq(vouchers.id, entries.voucherId))
    .innerJoin(accounts, eq(accounts.number, entries.accountNumber))
    .where(
      and(
        gte(vouchers.date, term.from),
        lte(vouchers.date, term.to),
        sql`${entries.vatCode} is not null`,
      ),
    )
    .groupBy(entries.accountNumber, entries.vatCode);

  const outputAccounts = new Set<string>(
    VAT_CODE_LIST.map((c) => VAT_CODES[c].output).filter((a) => a !== null),
  );
  const inputAccounts = new Set<string>(
    VAT_CODE_LIST.map((c) => VAT_CODES[c].input).filter((a) => a !== null),
  );
  const sales = VAT_CODE_LIST.map((code) => ({
    code,
    label: VAT_CODES[code].label,
    base: 0,
    vat: 0,
  }));
  const purchases = VAT_CODE_LIST.filter((c) => VAT_CODES[c].rate > 0).map(
    (code) => ({ code, label: VAT_CODES[code].label, base: 0, vat: 0 }),
  );
  for (const r of rows) {
    const debit = Number(r.debit);
    const credit = Number(r.credit);
    const code = r.vatCode ?? "";
    if (outputAccounts.has(r.account)) {
      const s = sales.find((x) => x.code === code);
      if (s) s.vat += credit - debit;
    } else if (inputAccounts.has(r.account)) {
      const p = purchases.find((x) => x.code === code);
      if (p) p.vat += debit - credit;
    } else if (r.type === "income") {
      const s = sales.find((x) => x.code === code);
      if (s) s.base += credit - debit;
    } else if (r.type === "expense" || r.type === "asset") {
      const p = purchases.find((x) => x.code === code);
      if (p) p.base += debit - credit;
    }
  }
  const outputVat = sales.reduce((s, r) => s + r.vat, 0);
  const inputVat = purchases.reduce((s, r) => s + r.vat, 0);
  return {
    ...term,
    sales,
    purchases,
    outputVat,
    inputVat,
    // Positive: to pay. Negative: to get back.
    payable: outputVat - inputVat,
  };
}

/** Balance of one account up to a date, with its natural sign. */
export async function accountBalance(number: string, to: string) {
  const [row] = await db
    .select({
      type: accounts.type,
      debit: sql<number>`coalesce(sum(${entries.debitOre}), 0)`,
      credit: sql<number>`coalesce(sum(${entries.creditOre}), 0)`,
    })
    .from(accounts)
    .leftJoin(entries, eq(entries.accountNumber, accounts.number))
    .leftJoin(vouchers, eq(vouchers.id, entries.voucherId))
    .where(
      and(
        eq(accounts.number, number),
        sql`(${vouchers.date} is null or ${vouchers.date} <= ${to})`,
      ),
    )
    .groupBy(accounts.number);
  if (!row) return 0;
  return signed(row.type, Number(row.debit), Number(row.credit));
}
