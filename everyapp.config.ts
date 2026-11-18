import { defineEveryApp } from "@every-app/sdk";

// defineEveryApp types the manifest. The Gateway keeps it; the Worker gets
// the bindings it lists (env.DB, env.files), never the file.
export default defineEveryApp({
  id: "bookkeeping",
  name: "Bookkeeping",
  description:
    "Double-entry bookkeeping for a small business: invoices, purchases with receipts, VAT and financial reports.",
  icon: "/icon.svg",
  access: "everyone",
  resources: {
    d1: ["DB"],
    // Receipt photos and PDFs, served only to members.
    r2: ["files"],
  },
  capabilities: {
    email: {
      access: "write",
      why: "Emails invoices and payment reminders to customers.",
    },
  },
  features: {
    email: {
      name: "Invoice email",
      why: "Emails invoices and payment reminders to customers. Without it, share the invoice link yourself.",
      capabilities: ["email"],
    },
  },
  // Customers open an issued invoice by its unguessable link without
  // signing in (src/routes/p/$token.tsx), with the styles and scripts it loads.
  public: [{ path: "/p/:token", methods: ["GET"] }],
  publicAssets: ["/assets/**", "/icon.svg"],
});
