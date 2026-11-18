// The main path of every feature, as the owner (an admin) does it in the browser,
// with request-level checks on the server routes.
import { startRuntime, expect } from '/home/user/oss-new/control/runtime/index.mjs';
import {
  RECEIPT_PNG, createContact, createDraft, createPurchase, isoDate, issueDraft,
  registerPayment, setupCompany, waitHydrated,
} from './lib.mjs';

const runtime = await startRuntime();
try {
  const page = await (await runtime.context('owner')).newPage();
  const today = isoDate(0);

  // F001: company profile, chart of accounts, VAT codes.
  await setupCompany(page);
  await page.reload();
  await expect(page.locator('#company-name')).toHaveValue('Fjordlys Design AS');
  await expect(page.locator('[data-testid="account-1920"]')).toContainText('Bank account');
  await expect(page.locator('[data-testid="account-1500"]')).toBeVisible();
  await expect(page.locator('[data-testid="account-2400"]')).toBeVisible();
  await expect(page.locator('[data-testid="account-3000"]')).toBeVisible();
  await page.click('[data-testid="add-account"]');
  await page.fill('#account-number', '6420');
  await page.fill('#account-name', 'Software subscriptions');
  await page.click('[data-testid="dialog-submit"]');
  await expect(page.locator('[data-testid="account-6420"]')).toContainText('Software subscriptions');
  // A duplicate number is refused.
  await page.click('[data-testid="add-account"]');
  await page.fill('#account-number', '6420');
  await page.fill('#account-name', 'Again');
  await page.click('[data-testid="dialog-submit"]');
  await expect(page.locator('[data-testid="dialog-error"]')).toContainText('already exists');
  await page.getByRole('button', { name: 'Cancel' }).click();
  // An unused account can be deleted.
  await page.click('[data-testid="delete-account-6420"]');
  await expect(page.locator('[data-testid="account-6420"]')).toHaveCount(0);

  // F002: contacts.
  await createContact(page, { name: 'Nordhavn Bakeri AS', email: 'post@nordhavn-bakeri.example', org: '998 877 665' });
  await createContact(page, { name: 'Kontorhuset Bergen AS', customer: false, supplier: true });
  await createContact(page, { name: 'Solsiden Kafé', email: 'hei@solsiden.example' });
  await page.fill('[data-testid="contact-search"]', 'Nordhavn');
  await expect(page.locator('[data-testid="contact-row"]')).toHaveCount(1);

  // F003: draft, totals in øre, issue, public link, payments.
  await createDraft(page, {
    customer: 'Nordhavn Bakeri AS',
    lines: [
      { description: 'Logo design', quantity: '1', price: '12000' },
      { description: 'Brand guidelines booklet', quantity: '2', price: '3500' },
    ],
  });
  await expect(page.locator('[data-testid="form-total"]')).toContainText('23 750.00');
  await expect(page.locator('[data-testid="due-date"]')).toHaveValue(isoDate(14));
  await issueDraft(page, { email: true });
  const invoiceUrl = page.url();
  await expect(page.locator('[data-testid="status"]').first()).toHaveText('Unpaid');
  await expect(page.locator('[data-testid="invoice-total"]')).toContainText('23 750.00');
  await expect(page.locator('[data-testid="messages"]')).toContainText("Not sent: Email isn't set up");
  const publicUrl = await page.locator('[data-testid="public-link"]').inputValue();
  expect(new URL(publicUrl).hostname).toBe(runtime.hostname);
  const publicPage = await runtime.fetch(new URL(publicUrl).pathname);
  expect(publicPage.status).toBe(200);
  const publicHtml = await publicPage.text();
  expect(publicHtml).toContain('Logo design');
  expect(publicHtml).toContain('23 750.00');
  expect(publicHtml).toContain('Fjordlys Design AS');

  await registerPayment(page, '10000');
  await expect(page.locator('[data-testid="status"]').first()).toHaveText('Partly paid');
  await registerPayment(page, '20000');
  await expect(page.locator('[data-testid="dialog-error"]')).toContainText('more than');
  await page.fill('[data-testid="payment-amount"]', '13750');
  await page.click('[data-testid="dialog-submit"]');
  await expect(page.locator('[data-testid="status"]').first()).toHaveText('Paid');
  await expect(page.locator('[data-testid="payments"]')).toContainText('13 750.00');

  // Overdue invoice: reminder logged, then cancelled by a credit note.
  await createDraft(page, {
    customer: 'Solsiden Kafé',
    issueDate: isoDate(-30),
    dueDate: isoDate(-16),
    lines: [{ description: 'Menu card layout', quantity: '1', price: '2000', vat: 'exempt', account: '3200' }],
  });
  await issueDraft(page);
  await expect(page.locator('[data-testid="status"]').first()).toHaveText('Overdue');
  await page.click('[data-testid="send-reminder"]');
  await expect(page.locator('[data-testid="messages"]')).toContainText('Reminder to hei@solsiden.example');
  await page.click('[data-testid="credit"]');
  await page.click('[data-testid="dialog-submit"]');
  await expect(page.locator('[data-testid="status"]').first()).toHaveText('Credited');
  await expect(page.locator('[data-testid="related-link"]')).toContainText('credit note');
  await expect(page.getByRole('button', { name: 'Register payment' })).toHaveCount(0);

  // F005: purchase with receipt, unpaid then paid.
  const purchaseId = await createPurchase(page, {
    supplier: 'Kontorhuset Bergen AS',
    description: 'Printer paper and toner',
    amount: '1250',
    paidNow: false,
    dueDate: isoDate(10),
    receipt: RECEIPT_PNG,
  });
  await expect(page.locator('[data-testid="purchase-status"]')).toHaveText('Unpaid');
  await expect(page.locator('[data-testid="receipt-link"]')).toHaveText('receipt.png');
  const receipt = await runtime.fetch(`/api/purchases/${purchaseId}/receipt`, { role: 'member' });
  expect(receipt.status).toBe(200);
  expect(receipt.headers.get('content-type')).toBe('image/png');
  const dash = await (async () => { await page.goto('/'); await waitHydrated(page); return page; })();
  await expect(dash.locator('[data-testid="tile-payables"]')).toHaveText('1 250.00');
  await page.goto(`/purchases/${purchaseId}`);
  await waitHydrated(page);
  await page.click('[data-testid="pay-purchase"]');
  await page.click('[data-testid="dialog-submit"]');
  await expect(page.locator('[data-testid="purchase-status"]')).toHaveText('Paid');
  await page.goto('/purchases?status=paid');
  await expect(page.locator('[data-testid="purchase-row"]')).toHaveCount(1);
  await page.goto('/purchases?status=unpaid');
  await expect(page.locator('[data-testid="purchase-row"]')).toHaveCount(0);

  // F006: manual entries, journal, ledger, reports, CSV.
  await page.goto('/journal/new');
  await waitHydrated(page);
  await page.fill('#entry-description', 'Share capital paid in');
  await page.selectOption('[data-testid="entry-account-0"]', '1920');
  await page.fill('[data-testid="entry-debit-0"]', '30000');
  await page.selectOption('[data-testid="entry-account-1"]', '2000');
  await page.fill('[data-testid="entry-credit-1"]', '29000');
  await page.click('[data-testid="save-entry"]');
  await expect(page.locator('[data-testid="form-error"]')).toContainText('Debit and credit must be equal');
  await page.fill('[data-testid="entry-credit-1"]', '30000');
  await Promise.all([page.waitForURL(/\/journal$/), page.click('[data-testid="save-entry"]')]);
  await expect(page.locator('[data-testid="voucher"]', { hasText: 'Share capital paid in' })).toBeVisible();
  await expect(page.locator('[data-testid="voucher"]', { hasText: 'Payment of invoice 1' })).toHaveCount(2);

  await page.goto(`/journal/ledger?account=1920&from=${isoDate(-60)}&to=${today}`);
  await expect(page.locator('[data-testid="closing-balance"]')).toHaveText('52 500.00');

  await page.goto(`/reports?view=profit&from=${isoDate(-60)}&to=${today}`);
  await expect(page.locator('[data-testid="total-income"]')).toHaveText('19 000.00');
  await expect(page.locator('[data-testid="total-costs"]')).toHaveText('1 000.00');
  await expect(page.locator('[data-testid="result"]')).toHaveText('18 000.00');
  await page.goto(`/reports?view=balance&to=${today}`);
  const assets = await page.locator('[data-testid="total-assets"]').textContent();
  await expect(page.locator('[data-testid="total-equity-liabilities"]')).toHaveText(assets);
  await page.goto('/reports?view=vat');
  await expect(page.locator('[data-testid="output-vat"]')).toHaveText('4 750.00');
  await expect(page.locator('[data-testid="input-vat"]')).toHaveText('250.00');
  await expect(page.locator('[data-testid="vat-payable"]')).toHaveText('4 500.00');
  await expect(page.locator('[data-testid="vat-deadline"]')).toContainText('Filing deadline');

  const [year, month] = today.split('-').map(Number);
  const vatCsv = await runtime.fetch(`/export/vat?year=${year}&term=${Math.ceil(month / 2)}`, { role: 'owner' });
  expect(vatCsv.status).toBe(200);
  expect(vatCsv.headers.get('content-type')).toContain('text/csv');
  const vatText = await vatCsv.text();
  expect(vatText).toContain('To pay,,,4500.00');
  const journalCsv = await runtime.fetch(`/export/journal?from=${isoDate(-60)}&to=${today}`, { role: 'member' });
  expect(journalCsv.status).toBe(200);
  expect(await journalCsv.text()).toContain('Share capital paid in');

  // F004: recurring invoice issued by the daily job, once per date.
  await page.goto('/recurring/new');
  await waitHydrated(page);
  await page.selectOption('[data-testid="customer"]', { label: 'Nordhavn Bakeri AS' });
  await page.selectOption('[data-testid="interval"]', 'monthly');
  await page.fill('[data-testid="line-description-0"]', 'Website hosting and support');
  await page.fill('[data-testid="line-price-0"]', '990');
  await Promise.all([page.waitForURL(/\/recurring\/[0-9a-f-]{36}$/), page.click('[data-testid="save-template"]')]);
  const templateUrl = page.url();
  await runtime.scheduled('0 5 * * *');
  await runtime.scheduled('0 5 * * *');
  await page.goto(templateUrl);
  await waitHydrated(page);
  await expect(page.locator('[data-testid="runs"] li')).toHaveCount(1);
  await expect(page.locator('[data-testid="runs"]')).toContainText('1 237.50');
  await expect(page.locator('[data-testid="template-status"]')).toHaveText('Active');
  await page.click('[data-testid="pause"]');
  await expect(page.locator('[data-testid="template-status"]')).toHaveText('Paused');
  await page.click('[data-testid="resume"]');
  await expect(page.locator('[data-testid="template-status"]')).toHaveText('Active');

  // F002: open balance; a contact on documents is archived, not deleted.
  await page.goto('/contacts?q=Nordhavn');
  await page.locator('[data-testid="contact-row"] a').click();
  await expect(page.locator('[data-testid="receivable"]')).toHaveText('1 237.50');
  await waitHydrated(page);
  await page.click('[data-testid="delete-contact"]');
  await page.click('[data-testid="dialog-submit"]');
  await expect(page.locator('[data-testid="dialog-error"]')).toContainText('Archive it instead');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.click('[data-testid="toggle-archive"]');
  await expect(page.locator('[data-testid="archived"]')).toBeVisible();
  await page.goto('/invoices/new');
  await expect(page.locator('[data-testid="customer"] option', { hasText: 'Nordhavn' })).toHaveCount(0);

  // F001: the lock date refuses postings on or before it.
  await page.goto('/settings');
  await waitHydrated(page);
  await page.fill('#lock-date', today);
  await page.click('[data-testid="save-lock"]');
  await expect(page.locator('[data-testid="lock-status"]')).toContainText(today);
  await page.goto('/journal/new');
  await waitHydrated(page);
  await page.fill('#entry-description', 'Late correction');
  await page.selectOption('[data-testid="entry-account-0"]', '6800');
  await page.fill('[data-testid="entry-debit-0"]', '100');
  await page.selectOption('[data-testid="entry-account-1"]', '1920');
  await page.fill('[data-testid="entry-credit-1"]', '100');
  await page.click('[data-testid="save-entry"]');
  await expect(page.locator('[data-testid="form-error"]')).toContainText('locked');
  await page.goto(`/purchases/${purchaseId}`);
  await expect(page.locator('[data-testid="delete-purchase"]')).toHaveCount(0);

  // Dashboard figures and deadlines.
  await page.goto('/');
  await expect(page.locator('[data-testid="tile-bank"]')).toHaveText('52 500.00');
  await expect(page.locator('[data-testid="tile-receivables"]')).toHaveText('1 237.50');
  await expect(page.locator('[data-testid="deadlines"]')).toContainText('VAT return');
  await runtime.assertBackLink(page);

  // Phone-sized smoke.
  const phone = await (await runtime.context('member', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await phone.goto('/invoices');
  await expect(phone.locator('[data-testid="invoice-row"]').first()).toBeVisible();
  await expect(phone.getByRole('link', { name: 'All apps' })).toBeVisible();

  // The paid invoice, as the app's picture.
  await page.goto(invoiceUrl);
  await expect(page.locator('[data-testid="invoice-document"]')).toBeVisible();
  await runtime.screenshot(page);
  console.log('behavior: ok');
} finally {
  await runtime.close();
}
