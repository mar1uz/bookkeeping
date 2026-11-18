import { createServerFn } from "@tanstack/react-start";
import * as purchases from "@/server/purchases";
import { actorMiddleware } from "./actor";

export const getPurchases = createServerFn()
  .middleware([actorMiddleware])
  .validator((d: unknown) => purchases.listPurchasesInput.parse(d))
  .handler(({ data }) => purchases.listPurchases(data));

export const getPurchase = createServerFn()
  .middleware([actorMiddleware])
  .validator((d: unknown) => purchases.purchaseRef.parse(d))
  .handler(({ data, context: { actor } }) => purchases.getPurchase(data.id, actor));

export const createPurchase = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => purchases.purchaseInput.parse(d))
  .handler(({ data, context: { actor } }) => purchases.createPurchase(actor, data));

export const payPurchase = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => purchases.payPurchaseInput.parse(d))
  .handler(({ data, context: { actor } }) => purchases.payPurchase(actor, data));

export const deletePurchase = createServerFn({ method: "POST" })
  .middleware([actorMiddleware])
  .validator((d: unknown) => purchases.purchaseRef.parse(d))
  .handler(({ data, context: { actor } }) => purchases.deletePurchase(actor, data));
