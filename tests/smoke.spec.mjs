import { expect, test } from "@playwright/test";
import { startTestServer, stopTestServer } from "./helpers/pocketbase-test-server.mjs";
import { seedHouseholdData } from "./helpers/test-data.mjs";

let server;

test.beforeAll(async () => {
  // Smoke gebruikt dezelfde geisoleerde testserver als de API-tests.
  server = await startTestServer();
  await seedHouseholdData();
});

test.afterAll(async () => {
  await stopTestServer(server);
});

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  page.errors = errors;
  await page.addInitScript(() => {
    // Voorkom dat de persoonskiezer de laadcheck maskeert.
    localStorage.setItem("huishoudhub-person", "MV");
    localStorage.setItem("huishoudhub-theme", "light");
  });
});

test("app start, laadt taken en serveert modules correct", async ({ page }) => {
  // Bewaakt expliciet het MIME-probleem dat eerder "Taken laden..." veroorzaakte.
  const moduleResponse = await page.request.get("/js/config.js");
  expect(moduleResponse.ok()).toBeTruthy();
  expect(moduleResponse.headers()["content-type"]).toContain("javascript");

  await page.goto("/");
  await expect(page.locator("#loadingIndicator")).toBeHidden();
  await expect(page.getByRole("heading", { name: "Vandaag" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Iedereen" })).toBeVisible();
  await expect(page.locator("article.task")).not.toHaveCount(0);
  expect(page.errors).toEqual([]);
});
