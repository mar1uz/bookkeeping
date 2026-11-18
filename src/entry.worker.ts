import tanstackEntry from "@tanstack/react-start/server-entry";
import { everyApp } from "@every-app/sdk/server";
import { runRecurring } from "./server/recurring";

// everyApp() verifies the identity the Gateway sent before any request reaches
// the app (a request from anywhere else is a 401).
const app = everyApp<Env>(async (request) => tanstackEntry.fetch(request));

export default {
  fetch: app.fetch,
  // The daily job (cloudflare.config.ts): issues recurring invoices that are due.
  async scheduled() {
    await runRecurring();
  },
};
