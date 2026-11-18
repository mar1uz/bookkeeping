import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { isAdmin } from "@every-app/sdk/server";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { company } from "@/db/schema";
import { rememberUser, type Actor } from "@/server/books";

let knownOrigin: string | null = null;

/**
 * The signed-in member as the queries take them: recorded on first sight,
 * admin from the Gateway's role. Also keeps the address members open the
 * app at, for links in emails the daily job sends.
 */
export const actorMiddleware = createMiddleware({ type: "function" })
  .middleware([ensureUserMiddleware])
  .server(async ({ next, context: { user } }) => {
    await rememberUser(user.id, user.email);
    const origin = new URL(getRequest().url).origin;
    if (origin !== knownOrigin) {
      await db.update(company).set({ appOrigin: origin }).where(eq(company.id, 1));
      knownOrigin = origin;
    }
    const actor: Actor = { id: user.id, email: user.email, admin: isAdmin(user) };
    return next({ context: { actor, origin } });
  });
