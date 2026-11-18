// Who may do what: private paths, the public invoice link, drafts private to
// their creator, admin-only settings, owner-or-admin templates and purchases,
// and no sign-in of the app's own.
import { startRuntime, expect } from '/home/user/oss-new/control/runtime/index.mjs';
import {
  RECEIPT_PNG, captureServerFn, createContact, createDraft, createPurchase,
  issueDraft, setupCompany, waitHydrated,
} from './lib.mjs';

/** A server function refusal: an error status, or the serialized error with its sentence. */
async function expectRefused(response, sentence) {
  const text = await response.text();
  if (response.status < 400) expect(text).toContain('$TSR/Error');
  expect(text).toContain(sentence);
}

const runtime = await startRuntime();
try {
  await runtime.assertPrivateAccess([
    '/', '/invoices', '/recurring', '/purchases', '/contacts', '/journal',
    '/journal/ledger', '/reports', '/settings', '/health',
    '/export/journal?from=2026-01-01&to=2026-12-31',
  ]);

  const owner = await (await runtime.context('owner')).newPage();
  const member = await (await runtime.context('member')).newPage();

  await setupCompany(owner, 'Havbris Regnskap AS');
  await createContact(owner, { name: 'Lysverket Studio', email: 'faktura@lysverket.example' });
  await createContact(owner, { name: 'Papirhuset AS', customer: false, supplier: true });

  // Admin-only: the member sees no way to change settings, and the server refuses.
  await owner.goto('/settings');
  await waitHydrated(owner);
  const saveCompany = await captureServerFn(owner, () => owner.click('[data-testid="save-company"]'));
  await member.goto('/settings');
  await waitHydrated(member);
  await expect(member.getByText('Only admins can change these.')).toBeVisible();
  await expect(member.locator('[data-testid="save-company"]')).toHaveCount(0);
  await expect(member.locator('[data-testid="add-account"]')).toHaveCount(0);
  const refusedCompany = await runtime.fetch(saveCompany.path, {
    role: 'member', method: 'POST', headers: saveCompany.headers,
    body: saveCompany.body.replace('Havbris Regnskap AS', 'Taken Over AS'),
  });
  await expectRefused(refusedCompany, 'Only an admin can do this.');
  await owner.reload();
  await expect(owner.locator('#company-name')).toHaveValue('Havbris Regnskap AS');

  // Drafts are private to their creator (and admins).
  const draftId = await createDraft(owner, {
    customer: 'Lysverket Studio',
    lines: [{ description: 'Confidential retainer draft', quantity: '1', price: '5000' }],
  });
  await owner.fill('[data-testid="line-description-0"]', 'Confidential retainer v2');
  const saveDraft = await captureServerFn(owner, () => owner.click('[data-testid="save-invoice"]'));
  await expect(owner.getByText('Draft saved')).toBeVisible();
  await member.goto(`/invoices/${draftId}`);
  await expect(member.locator('[data-testid="not-found"]')).toBeVisible();
  await expect(member.locator('body')).not.toContainText('Confidential retainer');
  await member.goto('/invoices');
  await expect(member.locator('body')).not.toContainText('Lysverket Studio');
  // Replaying the owner's save as the member is refused and changes nothing.
  const refusedDraft = await runtime.fetch(saveDraft.path, {
    role: 'member', method: 'POST', headers: saveDraft.headers,
    body: saveDraft.body.replace('Confidential retainer v2', 'Changed by member'),
  });
  await expectRefused(refusedDraft, 'No such invoice.');
  await owner.goto(`/invoices/${draftId}`);
  await expect(owner.locator('[data-testid="line-description-0"]')).toHaveValue('Confidential retainer v2');
  // The owner (an admin) sees a member's draft.
  const memberDraft = await createDraft(member, {
    customer: 'Lysverket Studio',
    lines: [{ description: 'Workshop facilitation', quantity: '3', price: '1500' }],
  });
  await owner.goto(`/invoices/${memberDraft}`);
  await expect(owner.locator('[data-testid="line-description-0"]')).toHaveValue('Workshop facilitation');

  // Public link: only the issued invoice, no member pages, unguessable.
  await owner.goto(`/invoices/${draftId}`);
  await waitHydrated(owner);
  await issueDraft(owner);
  const link = new URL(await owner.locator('[data-testid="public-link"]').inputValue());
  const anon = await runtime.fetch(link.pathname);
  expect(anon.status).toBe(200);
  const html = await anon.text();
  expect(html).toContain('Confidential retainer v2');
  expect(html).not.toContain('Register payment');
  expect(html).not.toContain('All apps');
  expect((await runtime.fetch('/p/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).status).toBe(404);
  // A draft has no link, and the token is not the id.
  expect((await runtime.fetch(`/p/${memberDraft}`)).status).toBe(404);
  for (const path of ['/invoices', `/invoices/${draftId}`, '/settings', '/export/journal?from=2026-01-01&to=2026-12-31']) {
    const r = await runtime.fetch(path);
    expect(r.status, path).not.toBe(200);
  }

  // Recurring templates: only the owner of the template or an admin changes it.
  await member.goto('/recurring/new');
  await waitHydrated(member);
  await member.selectOption('[data-testid="customer"]', { label: 'Lysverket Studio' });
  await member.fill('[data-testid="line-description-0"]', 'Monthly maintenance');
  await member.fill('[data-testid="line-price-0"]', '800');
  await Promise.all([member.waitForURL(/\/recurring\/[0-9a-f-]{36}$/), member.click('[data-testid="save-template"]')]);
  await waitHydrated(member);
  const pause = await captureServerFn(member, () => member.click('[data-testid="pause"]'));
  await expect(member.locator('[data-testid="template-status"]')).toHaveText('Paused');
  await member.click('[data-testid="resume"]');
  await expect(member.locator('[data-testid="template-status"]')).toHaveText('Active');

  await owner.goto('/recurring/new');
  await waitHydrated(owner);
  await owner.selectOption('[data-testid="customer"]', { label: 'Lysverket Studio' });
  await owner.fill('[data-testid="line-description-0"]', 'Quarterly review');
  await owner.fill('[data-testid="line-price-0"]', '4000');
  await Promise.all([owner.waitForURL(/\/recurring\/[0-9a-f-]{36}$/), owner.click('[data-testid="save-template"]')]);
  const ownerTemplate = owner.url().split('/').pop();
  await member.goto(`/recurring/${ownerTemplate}`);
  await expect(member.locator('[data-testid="template-status"]')).toHaveText('Active');
  await expect(member.locator('[data-testid="pause"]')).toHaveCount(0);
  const refusedPause = await runtime.fetch(pause.path, {
    role: 'member', method: 'POST', headers: pause.headers,
    body: pause.body.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/, ownerTemplate),
  });
  await expectRefused(refusedPause, 'Only its owner or an admin can change this recurring invoice.');
  await owner.reload();
  await expect(owner.locator('[data-testid="template-status"]')).toHaveText('Active');

  // Purchases: only the creator or an admin deletes; receipts are members-only.
  const keep = await createPurchase(owner, { supplier: 'Papirhuset AS', description: 'Envelopes', amount: '375', receipt: RECEIPT_PNG });
  const drop = await createPurchase(owner, { supplier: 'Papirhuset AS', description: 'Labels', amount: '125' });
  await member.goto(`/purchases/${keep}`);
  await expect(member.locator('[data-testid="receipt-link"]')).toBeVisible();
  await expect(member.locator('[data-testid="delete-purchase"]')).toHaveCount(0);
  await owner.goto(`/purchases/${drop}`);
  await waitHydrated(owner);
  await owner.click('[data-testid="delete-purchase"]');
  const del = await captureServerFn(owner, () => owner.click('[data-testid="dialog-submit"]'));
  await owner.waitForURL(/\/purchases$/);
  const refusedDelete = await runtime.fetch(del.path, {
    role: 'member', method: 'POST', headers: del.headers, body: del.body.replace(drop, keep),
  });
  await expectRefused(refusedDelete, 'Only the person who registered it or an admin can delete this purchase.');
  await owner.goto('/purchases');
  await expect(owner.locator('[data-testid="purchase-row"]', { hasText: 'Envelopes' })).toBeVisible();
  await expect(owner.locator('[data-testid="purchase-row"]', { hasText: 'Labels' })).toHaveCount(0);
  expect((await runtime.fetch(`/api/purchases/${keep}/receipt`)).status).not.toBe(200);
  expect((await runtime.fetch(`/api/purchases/${keep}/receipt`, { role: 'outsider' })).status).not.toBe(200);
  expect((await runtime.fetch(`/api/purchases/${keep}/receipt`, { role: 'member' })).status).toBe(200);

  // No sign-in of the app's own.
  for (const path of ['/login', '/signin', '/signup', '/logout', '/register', '/auth/login']) {
    const r = await runtime.fetch(path, { role: 'member' });
    expect(r.status, path).toBe(404);
    expect(await r.text()).not.toContain('type="password"');
  }
  console.log('authorization: ok');
} finally {
  await runtime.close();
}
