import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as books from "@/server/books";
import * as ledger from "@/server/ledger";
import * as dashboard from "@/server/dashboard";
import { actorMiddleware } from "./actor";

export const getSettings = createServerFn()
  .middleware([actorMiddleware])
  .handler(async ({ context: { actor } }) => {
    const { appOrigin: _o, ...company } = await books.getCompany();
    return { company, accounts: await books.listAccounts(), isAdmin: actor.admin };
  });

export const getAccounts = createServerFn()
  .middleware([actorMiddleware])
  .handler(() => books.listAccounts());

export const updateCompany = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => books.companyInput.parse(d))
  .handler(async ({ data, context: { actor } }) => {
    await books.updateCompany(actor, data);
  });

export const setLockDate = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => books.lockInput.parse(d))
  .handler(async ({ data, context: { actor } }) => {
    await books.setLockDate(actor, data);
  });

export const createAccount = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => books.accountInput.parse(d))
  .handler(({ data, context: { actor } }) => books.createAccount(actor, data));

export const setAccountActive = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => books.accountRef.extend({ active: z.boolean() }).parse(d))
  .handler(({ data, context: { actor } }) => books.setAccountActive(actor, data));

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => books.accountRef.parse(d))
  .handler(({ data, context: { actor } }) => books.deleteAccount(actor, data));

export const getDashboard = createServerFn()
  .middleware([actorMiddleware])
  .handler(() => dashboard.dashboard());

export const createManualEntry = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => ledger.manualEntryInput.parse(d))
  .handler(({ data, context: { actor } }) => ledger.createManualEntry(actor, data));

export const getJournal = createServerFn()
  .middleware([actorMiddleware])
  .validator((d: unknown) => ledger.periodInput.parse(d))
  .handler(({ data }) => ledger.journal(data));

export const getGeneralLedger = createServerFn()
  .middleware([actorMiddleware])
  .validator((d: unknown) => ledger.ledgerInput.parse(d))
  .handler(({ data }) => ledger.generalLedger(data));

export const getProfitAndLoss = createServerFn()
  .middleware([actorMiddleware])
  .validator((d: unknown) => ledger.periodInput.parse(d))
  .handler(({ data }) => ledger.profitAndLoss(data));

export const getBalanceSheet = createServerFn()
  .middleware([actorMiddleware])
  .validator((d: unknown) => ledger.asOfInput.parse(d))
  .handler(({ data }) => ledger.balanceSheet(data));

export const getVatReport = createServerFn()
  .middleware([actorMiddleware])
  .validator((d: unknown) => ledger.vatInput.parse(d))
  .handler(({ data }) => ledger.vatReport(data));
