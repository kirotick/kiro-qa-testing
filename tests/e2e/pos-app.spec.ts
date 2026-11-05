import { test, expect, Page } from '@playwright/test';
import { setupPos, watchPage, rupees } from '../helpers';

// KIRO POS app (web/site/app). Each test gets a fresh browser profile, so its IndexedDB data is
// isolated test data and never real shop data.

async function addItems(page: Page, ids: string[]) {
  await page.locator('[data-act="newBill"]:visible').first().click();
  for (const id of ids) await page.locator(`[data-act="addItem"][data-arg="${id}"]`).first().click();
}

test('setup: business name is required, sample menu loads', async ({ page }) => {
  const w = watchPage(page);
  await page.goto('/app/');
  await page.getByRole('button', { name: 'Start billing' }).click();
  await expect(page.getByText('Today’s sales')).toHaveCount(0); // still on setup
  await setupPos(page);
  for (const label of ['Home', 'Tables', 'New bill', 'Reports', 'More']) await expect(page.getByRole('button', { name: label }).first()).toBeVisible();
  w.expectClean();
});

test('bill: totals, GST split and round-off are consistent', async ({ page }) => {
  await setupPos(page);
  await addItems(page, ['i-idli', 'i-idli', 'i-pongal']); // 2 x 40 + 55
  await expect(page.locator('.actionbar')).toContainText('3 items, ₹135.00');
  await expect(page.locator('.actionbar')).toContainText('GST ₹6.76');
  await page.locator('[data-act="toCollect"]').click();
  await expect(page.getByText('₹142', { exact: true }).first()).toBeVisible();
  await page.locator('[data-act="payMethod"][data-arg="cash"]').click();
  await page.locator('[data-act="cashQuick"][data-arg="20000"]').click();
  await page.locator('[data-act="payCash"]').click();
  await expect(page.getByText('Taxable value')).toBeVisible(); // wait for the receipt before reading it
  await expect(page.getByText('Round off')).toBeVisible();
  const receipt = await page.locator('body').innerText();
  // Independent check of the receipt arithmetic: items + CGST + SGST + round off = total.
  const num = (label: string) => rupees(receipt.split(label)[1].split('\n').find((l) => /₹/.test(l))!);
  const items = num('Taxable value'), cgst = num('CGST 2.5%'), sgst = num('SGST 2.5%');
  const roundOff = Number((receipt.match(/Round off\s*\n\s*([+-])₹([\d.]+)/) || [, '+', '0'])[1] + (receipt.match(/Round off\s*\n\s*[+-]₹([\d.]+)/) || [, '0'])[1]);
  const total = num('Total');
  expect(items).toBe(135);
  expect(cgst).toBe(3.38); // 135 x 2.5% = 3.375, rounded per tax component
  expect(sgst).toBe(3.38);
  expect(Math.round((items + cgst + sgst + roundOff) * 100) / 100).toBe(total);
  expect(total).toBe(142);
  await expect(page.getByText('Give back ₹58.00')).toBeVisible();
});

test('rapid clicks on "Cash received" create exactly one bill', async ({ page }) => {
  await setupPos(page);
  await addItems(page, ['i-idli']);
  await page.locator('[data-act="toCollect"]').click();
  await page.locator('[data-act="payMethod"][data-arg="cash"]').click();
  await page.locator('[data-act="cashQuick"]').first().click();
  const pay = page.locator('[data-act="payCash"]');
  await pay.evaluate((b: HTMLElement) => { b.click(); b.click(); b.click(); b.click(); });
  await page.locator('[data-act="nav"][data-arg="home"]:visible').first().click();
  await expect(page.getByText(/^1 bill$/).first()).toBeVisible();
});

test('rapid clicks on an item tile add one item per click, no more', async ({ page }) => {
  await setupPos(page);
  await page.locator('[data-act="newBill"]:visible').first().click();
  // Five quick taps like a cashier would make (about 60 ms apart): every tap must count once.
  for (let i = 0; i < 5; i++) await page.locator('[data-act="addItem"][data-arg="i-idli"]').first().click({ delay: 10 });
  await expect(page.locator('.actionbar')).toContainText('5 items, ₹200.00');
});

test('paid bill survives a page refresh (saved on the device)', async ({ page }) => {
  await setupPos(page);
  await addItems(page, ['i-pongal']);
  await page.locator('[data-act="toCollect"]').click();
  await page.locator('[data-act="payMethod"][data-arg="card"]').click();
  await page.getByRole('button', { name: /received|paid|confirm/i }).first().click();
  await expect(page.getByText('collected')).toBeVisible(); // saved before the reload, not racing it
  await page.reload();
  await expect(page.getByText('Today’s sales')).toBeVisible();
  await expect(page.getByText(/^1 bill$/).first()).toBeVisible();
  await expect(page.getByText(/Card ₹58/)).toBeVisible(); // 55 + 5% GST (2.75) rounded to 58
});

// G-01 interim (Phase 0): KIRO cannot see the shop's bank account, so a UPI payment is only the
// cashier's word. It needs a UPI reference and is labelled "not verified" everywhere it is shown.
async function toUpi(page: Page) {
  await page.locator('[data-act="toCollect"]').click();
  // A new shop has no UPI ID yet: the collect screen opens on UPI and asks for one first.
  const upiBtn = page.locator('[data-act="payMethod"][data-arg="upi"]');
  if (await upiBtn.isVisible()) await upiBtn.click();
  const upiId = page.locator('#inline-upi');
  await expect(upiId.or(page.locator('#upi-ref'))).toBeVisible();
  if (await upiId.isVisible()) { await upiId.fill('qatestshop@okaxis'); await page.getByRole('button', { name: 'Save and show QR' }).click(); }
  await expect(page.locator('#upi-ref')).toBeVisible();
}

test('UPI: "Payment received" is refused without a UPI reference', async ({ page }) => {
  await setupPos(page);
  await addItems(page, ['i-idli']);
  await toUpi(page);
  await page.locator('[data-act="payUpi"]').click();
  await expect(page.locator('#upi-ref-err')).toContainText('Type the UPI reference');
  await page.locator('#upi-ref').fill('12 34'); // spaces are not a reference
  await page.locator('[data-act="payUpi"]').click();
  await expect(page.locator('#upi-ref-err')).toContainText('6 to 30 letters or numbers');
  await expect(page.locator('#upi-ref')).toBeVisible(); // still collecting: nothing was recorded as paid
  await expect(page.getByText('collected')).toHaveCount(0);
});

test('UPI: paid with a reference is shown as "confirmed by cashier, not verified"', async ({ page }) => {
  await setupPos(page);
  await addItems(page, ['i-pongal']);
  await toUpi(page);
  await page.locator('#upi-ref').fill('412345678901');
  await page.locator('[data-act="payUpi"]').click();
  await expect(page.getByText('collected')).toBeVisible();
  const body = await page.locator('body').innerText();
  expect(body).toContain('UPI (confirmed by cashier, not verified)');
  expect(body).toContain('412345678901');
  expect(body).toContain('₹58'); // amount unchanged: 55 + 5% GST, rounded
});

test('Close day: unverified UPI is listed for matching with the bank statement', async ({ page }) => {
  await setupPos(page);
  await addItems(page, ['i-idli']);
  await toUpi(page);
  await page.locator('#upi-ref').fill('512345678901');
  await page.locator('[data-act="payUpi"]').click();
  await expect(page.getByText('collected')).toBeVisible();
  await page.locator('[data-act="nav"][data-arg="reports"]:visible').first().click();
  await page.locator('[data-act="goto"][data-arg="closeday"]:visible').first().click();
  const card = page.locator('#upi-check');
  await expect(card).toContainText('UPI to check with your bank');
  await expect(card).toContainText('UPI, not verified');
  await expect(card).toContainText('₹42.00'); // 40 + 5% GST = 42
  await expect(card.locator('.sumrow').filter({ hasText: 'UPI payments with no reference' })).toContainText('0');
});

test('More menu links to the website and the KIRO LUX shop', async ({ page }) => {
  await setupPos(page);
  await page.locator('[data-act="profileToggle"]:visible, [data-act="profileSheet"]:visible').first().click();
  await page.getByText('KIRO LUX shop (kitchen supplies)').click();
  await expect(page).toHaveURL(/\/lux\/$/);
});
