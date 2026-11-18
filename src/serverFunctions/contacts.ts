import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as contacts from "@/server/contacts";
import { actorMiddleware } from "./actor";

export const getContacts = createServerFn()
  .middleware([actorMiddleware])
  .validator((d: unknown) => contacts.listInput.parse(d))
  .handler(({ data }) => contacts.listContacts(data));

export const pickContacts = createServerFn()
  .middleware([actorMiddleware])
  .validator((d: unknown) => z.object({ role: z.enum(["customer", "supplier"]) }).parse(d))
  .handler(({ data }) => contacts.pickContacts(data.role));

export const getContact = createServerFn()
  .middleware([actorMiddleware])
  .validator((d: unknown) => contacts.contactRef.parse(d))
  .handler(({ data, context: { actor } }) => contacts.getContact(data.id, actor));

export const createContact = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => contacts.contactInput.parse(d))
  .handler(({ data, context: { actor } }) => contacts.createContact(actor, data));

export const updateContact = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => contacts.contactUpdate.parse(d))
  .handler(({ data }) => contacts.updateContact(data));

export const setContactArchived = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => contacts.contactRef.extend({ archived: z.boolean() }).parse(d))
  .handler(({ data }) => contacts.setArchived(data));

export const deleteContact = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => contacts.contactRef.parse(d))
  .handler(({ data }) => contacts.deleteContact(data));
