// @ts-check
const { test, expect } = require('@playwright/test');

// Skip all tests when credentials are not supplied (CI without secrets, local dev).
const ADMIN_PHONE = process.env.ADMIN_PHONE;
const ADMIN_PASS  = process.env.ADMIN_PASS;
const SKIP = !ADMIN_PHONE || !ADMIN_PASS;

// ---------------------------------------------------------------------------
// Helper: log in as admin and wait for the clients tab to be visible
// ---------------------------------------------------------------------------
async function loginAsAdmin(page) {
  await page.goto('/admin.html');
  await page.waitForSelector('#authCard', { state: 'visible' });
  await page.fill('#phone', ADMIN_PHONE);
  await page.fill('#pass',  ADMIN_PASS);
  await page.click('#btnLogin');
  // Wait until the tabs are rendered (auth success shows .tabs-wrap)
  await page.waitForSelector('.tabs-wrap', { state: 'visible', timeout: 15000 });
  // Wait for client rows or empty-state text to appear
  await page.waitForSelector('#panelClients', { state: 'visible' });
}

// ---------------------------------------------------------------------------
// Test 1 — Search input exists and filters client rows
// ---------------------------------------------------------------------------
test('clients tab has search input that filters results', async ({ page }) => {
  test.skip(SKIP, 'ADMIN_PHONE / ADMIN_PASS not set');

  await loginAsAdmin(page);

  // Search input must be visible with the correct placeholder
  const input = page.locator('#clientSearchInput');
  await expect(input).toBeVisible();
  await expect(input).toHaveAttribute('placeholder', 'Caută după nume, telefon, email…');

  // Clear button starts hidden
  const clearBtn = page.locator('#clientSearchClear');
  await expect(clearBtn).toBeHidden();

  // Type a query — clear button should appear
  await input.fill('zzznomatch999');
  await expect(clearBtn).toBeVisible();

  // "Niciun client găsit." must appear (or list is empty)
  await expect(
    page.locator('#pending, #active').filter({ hasText: 'Niciun client găsit.' }).first()
  ).toBeVisible({ timeout: 2000 });

  // Clicking ✕ clears the field and hides the button
  await clearBtn.click();
  await expect(input).toHaveValue('');
  await expect(clearBtn).toBeHidden();
});

// ---------------------------------------------------------------------------
// Test 2 — Clicking a client row navigates to #client/{uid} detail panel
// ---------------------------------------------------------------------------
test('clicking a client row shows detail panel with back link', async ({ page }) => {
  test.skip(SKIP, 'ADMIN_PHONE / ADMIN_PASS not set');

  await loginAsAdmin(page);

  // Wait for at least one client row anchor
  const firstRow = page.locator('#pending a, #active a').first();
  await firstRow.waitFor({ state: 'visible', timeout: 10000 });

  // Extract the href to get the expected uid
  const href = await firstRow.getAttribute('href');
  expect(href).toMatch(/admin\.html#client\//);

  // Left-click: should navigate via hash (not open new tab)
  await firstRow.click();
  await expect(page).toHaveURL(/#client\//);

  // Detail panel must become active
  await expect(page.locator('#panelClientDetail')).toBeVisible();
  // List panel must be hidden
  await expect(page.locator('#panelClients')).toBeHidden();

  // "Clienți" tab must still be visually active
  const clientsTab = page.locator('.tab[data-panel="panelClients"]');
  await expect(clientsTab).toHaveClass(/active/);

  // Back link must be present
  const backLink = page.locator('#backToClients');
  await expect(backLink).toBeVisible();
  await expect(backLink).toHaveText(/Înapoi la clienți/);
});

// ---------------------------------------------------------------------------
// Test 3 — Back link returns to client list and restores search term
// ---------------------------------------------------------------------------
test('back link restores list and search term from sessionStorage', async ({ page }) => {
  test.skip(SKIP, 'ADMIN_PHONE / ADMIN_PASS not set');

  await loginAsAdmin(page);

  // Type a search term
  const input = page.locator('#clientSearchInput');
  const searchTerm = 'test';
  await input.fill(searchTerm);
  // Small wait for debounce
  await page.waitForTimeout(400);

  // Navigate to a client detail (simulate via hash)
  const firstRow = page.locator('#pending a, #active a').first();
  await firstRow.waitFor({ state: 'visible', timeout: 10000 });
  await firstRow.click();
  await expect(page.locator('#panelClientDetail')).toBeVisible();

  // Click back
  await page.locator('#backToClients').click();
  await expect(page).toHaveURL(/#clients/);

  // List panel must be visible again
  await expect(page.locator('#panelClients')).toBeVisible();

  // Search term must be restored
  await expect(page.locator('#clientSearchInput')).toHaveValue(searchTerm);
});
