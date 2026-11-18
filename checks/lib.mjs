// Shared steps for the suites: each drives the app the way a person does.
import { expect } from '/home/user/oss-new/control/runtime/index.mjs';

export function isoDate(offsetDays = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export async function waitHydrated(page) {
  await page.waitForLoadState('networkidle');
}

export async function setupCompany(page, name = 'Fjordlys Design AS') {
  await page.goto('/settings');
  await waitHydrated(page);
  await page.fill('#company-name', name);
  await page.fill('#company-org', '912 345 678');
  await page.fill('#company-address', 'Strandgata 14\n5013 Bergen');
  await page.fill('#company-bank', '1234.56.78903');
  await page.click('[data-testid="save-company"]');
  await expect(page.getByText('Company saved')).toBeVisible();
}

export async function createContact(page, { name, email = '', org = '', customer = true, supplier = false }) {
  await page.goto('/contacts');
  await waitHydrated(page);
  await page.click('[data-testid="new-contact"]');
  await page.fill('#contact-name', name);
  await page.fill('#contact-org', org);
  await page.fill('#contact-email', email);
  const isCustomer = page.locator('[data-testid="is-customer"]');
  if ((await isCustomer.getAttribute('aria-checked')) !== String(customer)) await isCustomer.click();
  const isSupplier = page.locator('[data-testid="is-supplier"]');
  if ((await isSupplier.getAttribute('aria-checked')) !== String(supplier)) await isSupplier.click();
  await page.click('[data-testid="save-contact"]');
  await expect(page.locator('[data-testid="contact-row"]', { hasText: name })).toBeVisible();
}

/** Creates a draft and returns its id; stays on the draft page. */
export async function createDraft(page, { customer, issueDate, dueDate, lines }) {
  await page.goto('/invoices/new');
  await waitHydrated(page);
  await page.selectOption('[data-testid="customer"]', { label: customer });
  if (issueDate) await page.fill('#issue-date', issueDate);
  if (dueDate) await page.fill('#due-date', dueDate);
  for (const [i, line] of lines.entries()) {
    if (i > 0) await page.getByRole('button', { name: 'Add line' }).click();
    await page.fill(`[data-testid="line-description-${i}"]`, line.description);
    await page.fill(`[data-testid="line-quantity-${i}"]`, line.quantity);
    await page.fill(`[data-testid="line-price-${i}"]`, line.price);
    if (line.vat) await page.selectOption(`[data-testid="line-vat-${i}"]`, line.vat);
    if (line.account) await page.selectOption(`[data-testid="line-account-${i}"]`, line.account);
  }
  await Promise.all([
    page.waitForURL(/\/invoices\/[0-9a-f-]{36}$/),
    page.click('[data-testid="save-invoice"]'),
  ]);
  await expect(page.getByRole('heading', { name: 'Draft invoice' })).toBeVisible();
  await waitHydrated(page);
  return page.url().split('/').pop();
}

export async function issueDraft(page, { email = false } = {}) {
  const box = page.locator('[data-testid="issue-email"]');
  if ((await box.getAttribute('aria-checked')) === 'true' && !email) await box.click();
  await page.click('[data-testid="issue"]');
  await page.click('[data-testid="dialog-submit"]');
  await expect(page.getByRole('heading', { name: /^Invoice \d+$/ }).first()).toBeVisible();
  await waitHydrated(page);
}

export async function registerPayment(page, amount, date) {
  await page.click('[data-testid="register-payment"]');
  await page.fill('[data-testid="payment-amount"]', amount);
  if (date) await page.fill('#payment-date', date);
  await page.click('[data-testid="dialog-submit"]');
}

export async function createPurchase(page, { supplier, description, account = '6800', vat = '25', amount, paidNow = true, dueDate, date, receipt }) {
  await page.goto('/purchases/new');
  await waitHydrated(page);
  await page.selectOption('[data-testid="supplier"]', { label: supplier });
  if (date) await page.fill('#purchase-date', date);
  await page.fill('#purchase-description', description);
  await page.selectOption('[data-testid="purchase-account"]', account);
  await page.selectOption('[data-testid="purchase-vat"]', vat);
  await page.fill('#purchase-amount', amount);
  await page.selectOption('[data-testid="purchase-paid"]', paidNow ? 'now' : 'later');
  if (!paidNow && dueDate) await page.fill('#purchase-due', dueDate);
  if (receipt) await page.setInputFiles('#purchase-receipt', receipt);
  await Promise.all([
    page.waitForURL(/\/purchases\/[0-9a-f-]{36}$/),
    page.click('[data-testid="save-purchase"]'),
  ]);
  await expect(page.getByRole('heading', { name: description })).toBeVisible();
  await waitHydrated(page);
  return page.url().split('/').pop();
}

/** A tiny valid PNG, as a receipt photo. */
export const RECEIPT_PNG = {
  name: 'receipt.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
};

/** Runs `trigger` and returns the server-function request it made. */
export async function captureServerFn(page, trigger, method = 'POST') {
  const [request] = await Promise.all([
    page.waitForRequest((r) => r.url().includes('/_serverFn/') && r.method() === method),
    trigger(),
  ]);
  const headers = { ...(await request.allHeaders()) };
  for (const h of Object.keys(headers)) {
    if (/^(cookie|host|content-length|origin|referer|authorization)$/i.test(h) || h.startsWith(':')) delete headers[h];
  }
  const url = new URL(request.url());
  return { path: url.pathname + url.search, method, headers, body: request.postData() ?? undefined };
}
