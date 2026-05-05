import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const HTML_PATH = resolve(
  fileURLToPath(import.meta.url),
  "..",
  "..",
  "28-perf-overview",
  "perf-flow.html",
);

test.describe("Lesson 28 · perf-flow.html DOM smoke", () => {
  test("renders title containing 性能", async ({ page }) => {
    await page.goto(`file://${HTML_PATH}`);
    const title = await page.title();
    expect(title).toContain("性能");
  });

  test("has at least 7 principle badges", async ({ page }) => {
    await page.goto(`file://${HTML_PATH}`);
    const badges = page.locator("[data-principle]");
    await expect(badges).toHaveCount(7);
  });

  test("has a timeline element", async ({ page }) => {
    await page.goto(`file://${HTML_PATH}`);
    const timeline = page.locator("[data-testid='timeline']");
    await expect(timeline).toBeVisible();
  });

  test("has a takeaway box", async ({ page }) => {
    await page.goto(`file://${HTML_PATH}`);
    const takeaway = page.locator("[data-testid='takeaway']");
    await expect(takeaway).toBeVisible();
  });
});
