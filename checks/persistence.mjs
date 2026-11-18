// Books survive a restart: contacts, issued invoices with their numbers and
// links, payments, purchases with receipts, and the journal.
import { startRuntime, expect } from '/home/user/oss-new/control/runtime/index.mjs';
import {
  RECEIPT_PNG, createContact, createDraft, createPurchase, issueDraft,
  registerPayment, setupCompany,
} from './lib.mjs';

const runtime = await startRuntime();
try {
  let page = await (await runtime.context('owner')).newPage();
  await setupCompany(page, 'Vestkyst Snekkeri AS');
  await createContact(page, { name: 'Bryggen Hotell', email: 'innkjop@bryggen.example', supplier: true });
  await createDraft(page, {
    customer: 'Bryggen Hotell',
    lines: [{ description: 'Oak reception desk', quantity: '1', price: '48000' }],
  });
  await issueDraft(page);
  const invoiceUrl = page.url();
  await registerPayment(page, '20000');
  await expect(page.locator('[data-testid="status"]').first()).toHaveText('Partly paid');
  const publicPath = new URL(await page.locator('[data-testid="public-link"]').inputValue()).pathname;
  const purchaseId = await createPurchase(page, {
    supplier: 'Bryggen Hotell', description: 'Timber delivery', account: '4000', amount: '6250', receipt: RECEIPT_PNG,
  });

  await runtime.restart();

  page = await (await runtime.context('owner')).newPage();
  await page.goto(invoiceUrl);
  await expect(page.getByRole('heading', { name: 'Invoice 1' }).first()).toBeVisible();
  await expect(page.locator('[data-testid="status"]').first()).toHaveText('Partly paid');
  await expect(page.locator('[data-testid="invoice-total"]')).toContainText('60 000.00');
  await expect(page.locator('[data-testid="payments"]')).toContainText('20 000.00');
  const pub = await runtime.fetch(publicPath);
  expect(pub.status).toBe(200);
  expect(await pub.text()).toContain('Oak reception desk');
  await page.goto(`/purchases/${purchaseId}`);
  await expect(page.locator('[data-testid="purchase-amount"]')).toHaveText('6 250.00');
  const receipt = await runtime.fetch(`/api/purchases/${purchaseId}/receipt`, { role: 'owner' });
  expect(receipt.status).toBe(200);
  await page.goto('/journal');
  await expect(page.locator('[data-testid="voucher"]')).toHaveCount(3);
  await page.goto('/contacts');
  await expect(page.locator('[data-testid="contact-row"]', { hasText: 'Bryggen Hotell' })).toBeVisible();
  console.log('persistence: ok');
} finally {
  await runtime.close();
}
