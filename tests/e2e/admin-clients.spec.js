// @ts-check
// Run: npx playwright install
// Then: ADMIN_PHONE=07... ADMIN_PASS=... npx playwright test tests/e2e/admin-clients.spec.js
const { test, expect } = require("@playwright/test");

const ADMIN_PHONE = process.env.ADMIN_PHONE || "";
const ADMIN_PASS = process.env.ADMIN_PASS || "";

test.describe("Admin Clients tab", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/admin.html#clients");
  });

  test("admin can open Clients tab and see search + list area", async ({ page }) => {
    if (!ADMIN_PHONE || !ADMIN_PASS) {
      test.skip();
      return;
    }
    await page.getByPlaceholder(/telefon/i).fill(ADMIN_PHONE);
    await page.getByPlaceholder(/parolă/i).fill(ADMIN_PASS);
    await page.getByRole("button", { name: /intră/i }).click();
    await expect(page.locator("#clientsSearchInput")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("#clientsListContainer")).toBeVisible();
  });

  test("search input filters list or shows empty state", async ({ page }) => {
    if (!ADMIN_PHONE || !ADMIN_PASS) {
      test.skip();
      return;
    }
    await page.getByPlaceholder(/telefon/i).fill(ADMIN_PHONE);
    await page.getByPlaceholder(/parolă/i).fill(ADMIN_PASS);
    await page.getByRole("button", { name: /intră/i }).click();
    await expect(page.locator("#clientsSearchInput")).toBeVisible({ timeout: 15000 });
    await page.locator("#clientsSearchInput").fill("xyznonexistent123");
    await page.waitForTimeout(500);
    await expect(page.locator("#clientsListContainer")).toContainText(/niciun client/i);
    const clearBtn = page.locator("#clientsSearchClear.has-value");
    if (await clearBtn.isVisible()) {
      await clearBtn.click();
      await expect(page.locator("#clientsSearchInput")).toHaveValue("");
    }
  });

  test("clicking a client row navigates to client details page", async ({ page }) => {
    if (!ADMIN_PHONE || !ADMIN_PASS) {
      test.skip();
      return;
    }
    await page.getByPlaceholder(/telefon/i).fill(ADMIN_PHONE);
    await page.getByPlaceholder(/parolă/i).fill(ADMIN_PASS);
    await page.getByRole("button", { name: /intră/i }).click();
    await expect(page.locator("#clientsSearchInput")).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2000);
    const firstRow = page.locator(".client-row").first();
    const rowCount = await page.locator(".client-row").count();
    if (rowCount === 0) {
      test.skip();
      return;
    }
    await firstRow.click();
    await expect(page).toHaveURL(/#client\//, { timeout: 5000 });
    await expect(page.locator("#clientDetailBack")).toBeVisible();
    await expect(page.locator("#clientDetailContent")).toBeVisible();
  });
});
