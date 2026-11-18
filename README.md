# Bookkeeping

Double-entry bookkeeping for a small Norwegian business: send invoices, register purchases with receipts, and get the ledger, VAT report and financial statements without posting entries by hand.

Inspired by https://fiken.no

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Set the company profile, keep a chart of accounts with standard VAT codes, and lock the books up to a date.
- Keep a shared list of customers and suppliers with what each owes or is owed.
- Issue numbered invoices, share them by link or email, register payments, send reminders and cancel with credit notes.
- Set up recurring invoices that a daily job issues on schedule.
- Register purchases and bills with a receipt photo or PDF, and mark bills paid.
- See the journal, account ledgers, profit and loss, balance sheet and the two-monthly VAT report, and export them as CSV.

Left out: accounts and sign-in, which your Gateway handles; bank feeds and reconciliation; payroll; tax and VAT filing to the authorities; EHF, eFaktura and KID; projects, time tracking and quotes; the mobile apps; and more than one company per install.

## Setup

```sh
pnpm install
pnpm dev          # run locally behind a dev Gateway
pnpm test         # unit tests
pnpm run deploy   # deploy to your Cloudflare account behind your Gateway
```

The app needs no secrets or settings. It uses a D1 database and an R2 bucket (`files`) for receipts; R2 must be enabled on the Cloudflare account once.

Optional: the Gateway's email capability (`pnpm everyapp configure bookkeeping`) lets the app email invoices and reminders to customers. Without it, share each invoice's link yourself.

The `checks/` suites run against a packaged release with the oss.new runtime; real email delivery and deployment were not part of them.

## Limitations

- Amounts are in NOK only.
- The VAT report is computed for you to file; it is not submitted anywhere.
- Recurring invoices are issued once a day at 05:00 UTC.
- A customer opens the invoice link without signing in, so anyone with the link can read that invoice.
