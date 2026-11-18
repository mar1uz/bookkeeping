import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as invoices from "@/server/invoices";
import * as recurring from "@/server/recurring";
import { actorMiddleware } from "./actor";

export const getInvoices = createServerFn()
  .middleware([actorMiddleware])
  .validator((d: unknown) => invoices.listInvoicesInput.parse(d))
  .handler(({ data, context: { actor } }) => invoices.listInvoices(actor, data));

export const getInvoice = createServerFn()
  .middleware([actorMiddleware])
  .validator((d: unknown) => invoices.invoiceRef.parse(d))
  .handler(async ({ data, context: { actor, origin } }) => {
    const invoice = await invoices.getInvoice(actor, data.id);
    if (!invoice) return null;
    const publicUrl = invoice.publicToken ? `${origin}/p/${invoice.publicToken}` : "";
    return { ...invoice, publicUrl };
  });

export const createDraft = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => invoices.invoiceInput.parse(d))
  .handler(({ data, context: { actor } }) => invoices.createDraft(actor, data));

export const updateDraft = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => invoices.invoiceUpdate.parse(d))
  .handler(({ data, context: { actor } }) => invoices.updateDraft(actor, data));

export const deleteDraft = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => invoices.invoiceRef.parse(d))
  .handler(({ data, context: { actor } }) => invoices.deleteDraft(actor, data));

export const issueInvoice = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => invoices.issueInput.parse(d))
  .handler(({ data, context: { actor, origin } }) =>
    invoices.issueInvoice(actor, data, origin),
  );

export const registerPayment = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => invoices.paymentInput.parse(d))
  .handler(({ data, context: { actor } }) => invoices.registerPayment(actor, data));

export const creditInvoice = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => invoices.creditInput.parse(d))
  .handler(({ data, context: { actor } }) => invoices.creditInvoice(actor, data));

export const sendReminder = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => invoices.invoiceRef.parse(d))
  .handler(({ data, context: { actor, origin } }) =>
    invoices.sendReminder(actor, data, origin),
  );

export const resendInvoice = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => invoices.invoiceRef.parse(d))
  .handler(({ data, context: { actor, origin } }) =>
    invoices.resendInvoice(actor, data, origin),
  );

// Recurring

export const getTemplates = createServerFn()
  .middleware([actorMiddleware])
  .handler(() => recurring.listTemplates());

export const getTemplate = createServerFn()
  .middleware([actorMiddleware])
  .validator((d: unknown) => recurring.templateRef.parse(d))
  .handler(({ data, context: { actor } }) => recurring.getTemplate(actor, data.id));

export const createTemplate = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => recurring.templateInput.parse(d))
  .handler(({ data, context: { actor } }) => recurring.createTemplate(actor, data));

export const updateTemplate = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => recurring.templateUpdate.parse(d))
  .handler(({ data, context: { actor } }) => recurring.updateTemplate(actor, data));

export const setTemplateStatus = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => recurring.statusInput.parse(d))
  .handler(({ data, context: { actor } }) => recurring.setTemplateStatus(actor, data));

/** The public view of an issued invoice: no sign-in, found by its token alone. */
export const getPublicInvoice = createServerFn()
  .validator((d: unknown) => z.object({ token: z.string().max(100) }).parse(d))
  .handler(({ data }) => invoices.publicInvoice(data.token));
