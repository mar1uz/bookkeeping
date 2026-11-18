import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { accounts, company, entries, users } from "@/db/schema";
import { refuse } from "./errors";
import { DATE } from "./money";

export type Actor = { id: string; email: string; admin: boolean };

/** Records the person on first sight, and keeps their email current. */
export async function rememberUser(id: string, email: string): Promise<void> {
  await db
    .insert(users)
    .values({ id, email })
    .onConflictDoUpdate({ target: users.id, set: { email } });
}

export function requireAdmin(actor: Actor): void {
  if (!actor.admin) refuse("Only an admin can do this.");
}

export async function getCompany() {
  const [row] = await db.select().from(company).where(eq(company.id, 1));
  return row!;
}

export const companyInput = z.object({
  name: z.string().trim().min(1, "Enter the company name").max(200),
  orgNumber: z.string().trim().max(30),
  address: z.string().trim().max(500),
  bankAccount: z.string().trim().max(40),
  dueDays: z.number().int().min(0).max(365),
  vatRegistered: z.boolean(),
});

export async function updateCompany(
  actor: Actor,
  input: z.infer<typeof companyInput>,
) {
  requireAdmin(actor);
  await db.update(company).set(input).where(eq(company.id, 1));
  return getCompany();
}

export const lockInput = z.object({
  lockDate: z.string().regex(DATE).nullable(),
});

export async function setLockDate(
  actor: Actor,
  input: z.infer<typeof lockInput>,
) {
  requireAdmin(actor);
  await db
    .update(company)
    .set({ lockDate: input.lockDate })
    .where(eq(company.id, 1));
  return getCompany();
}

/** Refuses a date on or before the lock date. */
export async function assertOpen(...dates: (string | null | undefined)[]) {
  const { lockDate } = await getCompany();
  if (!lockDate) return;
  for (const date of dates) {
    if (date && date <= lockDate) {
      refuse(`The books are locked up to ${lockDate}.`);
    }
  }
}

export const ACCOUNT_TYPES = [
  "asset",
  "liability",
  "equity",
  "income",
  "expense",
] as const;

export async function listAccounts() {
  const rows = await db
    .select({
      number: accounts.number,
      name: accounts.name,
      type: accounts.type,
      active: accounts.active,
      system: accounts.system,
      postings: sql<number>`(select count(*) from ${entries} where ${entries.accountNumber} = ${accounts.number})`,
    })
    .from(accounts)
    .orderBy(accounts.number);
  return rows.map((r) => ({ ...r, postings: Number(r.postings) }));
}

export const accountInput = z.object({
  number: z.string().regex(/^\d{4}$/, "The number has four digits"),
  name: z.string().trim().min(1, "Enter a name").max(120),
  type: z.enum(ACCOUNT_TYPES),
});

export async function createAccount(
  actor: Actor,
  input: z.infer<typeof accountInput>,
) {
  requireAdmin(actor);
  const [existing] = await db
    .select({ number: accounts.number })
    .from(accounts)
    .where(eq(accounts.number, input.number));
  if (existing) refuse(`Account ${input.number} already exists.`);
  await db.insert(accounts).values(input);
}

export const accountRef = z.object({
  number: z.string().regex(/^\d{4}$/),
});

export async function setAccountActive(
  actor: Actor,
  input: { number: string; active: boolean },
) {
  requireAdmin(actor);
  const [row] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.number, input.number));
  if (!row) refuse("No such account.");
  if (row.system && !input.active) refuse("The app posts to this account.");
  await db
    .update(accounts)
    .set({ active: input.active })
    .where(eq(accounts.number, input.number));
}

export async function deleteAccount(actor: Actor, input: { number: string }) {
  requireAdmin(actor);
  const [row] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.number, input.number));
  if (!row) refuse("No such account.");
  if (row.system) refuse("The app posts to this account.");
  const [used] = await db
    .select({ id: entries.id })
    .from(entries)
    .where(eq(entries.accountNumber, input.number))
    .limit(1);
  if (used) refuse("This account has postings. Deactivate it instead.");
  await db.delete(accounts).where(eq(accounts.number, input.number));
}

/** Refuses an account that doesn't exist or is inactive. */
export async function assertActiveAccount(number: string, types?: string[]) {
  const [row] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.number, number), eq(accounts.active, true)));
  if (!row) refuse(`Account ${number} isn't an active account.`);
  if (types && !types.includes(row.type)) {
    refuse(`Account ${number} can't be used here.`);
  }
  return row;
}
