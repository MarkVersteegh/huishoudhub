import { expect, test } from "@playwright/test";
import { startTestServer, stopTestServer } from "./helpers/pocketbase-test-server.mjs";
import { isoDate, seedHouseholdData } from "./helpers/test-data.mjs";

let server;

test.beforeAll(async () => {
  // Een server per worker/project; testdata wordt per test opnieuw gezaaid.
  server = await startTestServer();
});

test.afterAll(async () => {
  await stopTestServer(server);
});

test.beforeEach(async ({ page }) => {
  await seedHouseholdData();
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  page.errors = errors;
  await page.addInitScript(() => {
    // Tests beginnen met een vaste persoon en licht thema om modals/automatische dark mode te vermijden.
    localStorage.setItem("huishoudhub-person", "MV");
    localStorage.setItem("huishoudhub-theme", "light");
  });
  await page.goto("/");
  await expect(page.locator("#loadingIndicator")).toBeHidden();
  await page.getByRole("button", { name: "Iedereen" }).click();
});

test.afterEach(async ({ page }) => {
  expect(page.errors).toEqual([]);
});

test("Vandaag: filters, details en afvinken werken", async ({ page }) => {
  await expect(page.locator("#overdueCount")).toHaveText("1");
  await expect(page.locator("#nowCount")).toHaveText("1");
  await expect(page.locator("#todayCount")).toHaveText("3");

  await page.getByRole("button", { name: /nu/i }).click();
  await expect(page.locator("article.task").filter({ hasText: "Konijnen test verzorgen" })).toBeVisible();
  await expect(page.locator("article.task").filter({ hasText: "Vaatwasser test" })).toHaveCount(0);

  await page.locator("button.metric[data-filter='today']").click();
  await page.locator("article.task").filter({ hasText: "Konijnen test verzorgen" }).click();
  await expect(page.locator("#taskDetailOverlay.open")).toBeVisible();
  await expect(page.locator("#taskDetailContent")).toContainText("Afgerond door");
  await page.locator("#detailCheckBtn").click();
  await expect(page.locator("#taskDetailOverlay.open")).toHaveCount(0);
  await expect(page.locator("#doneTasks")).toContainText("Konijnen test verzorgen");
});

test("Deze week: compacte taken, details en afgerond deze week", async ({ page }) => {
  await page.getByRole("button", { name: "Deze week" }).click();
  await expect(page.getByRole("heading", { name: "Deze week" })).toBeVisible();
  await expect(page.locator("#weekView")).toContainText(/test/i);
  await expect(page.locator("#weekDoneTasks")).toContainText("Afgerond door ander test");

  const task = page.locator(".compact-task").filter({ hasText: "Handdoeken test draaien" });
  await expect(task).toBeVisible();
  await task.click();
  await expect(page.locator("#taskDetailOverlay.open")).toBeVisible();
  await expect(page.locator("#taskDetailContent")).toContainText("Handdoeken test draaien");
});

test("Lijst: taak toevoegen, bewerken en verwijderen", async ({ page }) => {
  const title = "UI test taak toevoegen";
  const updatedTitle = "UI test taak aangepast";
  page.on("dialog", (dialog) => dialog.accept());

  // Deze flow is de belangrijkste CRUD-regressietest voor het invoerscherm.
  await page.getByRole("button", { name: "Lijst" }).click();
  await page.getByRole("button", { name: /Nieuwe taak/ }).click();
  await page.locator("#taskTitle").fill(title);
  await page.locator("#taskDate").fill(isoDate(0));
  await page.locator("#personChoices label").filter({ hasText: "Emmy" }).click();
  await page.locator("#personChoices label").filter({ hasText: "Mark" }).click();
  await page.locator("#taskNote").fill("via e2e");
  await page.locator("#formSubmitButton").click({ force: true });
  await expect(page.getByRole("heading", { name: "Lijst" })).toBeVisible();
  await expect(page.locator(".compact-task").filter({ hasText: title })).toBeVisible();

  await page.locator(".compact-task").filter({ hasText: title }).getByRole("button", { name: "Bewerk" }).click();
  await page.locator("#taskTitle").fill(updatedTitle);
  await page.locator("#formSubmitButton").click({ force: true });
  await expect(page.locator(".compact-task").filter({ hasText: updatedTitle })).toBeVisible();

  await page.locator(".compact-task").filter({ hasText: updatedTitle }).getByRole("button", { name: "Bewerk" }).click();
  await page.locator("#deleteTaskButton").click({ force: true });
  await expect(page.locator("#confirmOverlay.open")).toBeVisible();
  await expect(page.locator("#confirmMessage")).toContainText("Dit kan niet ongedaan worden gemaakt");
  await page.locator("#confirmPrimaryButton").click();
  await expect(page.locator(".compact-task").filter({ hasText: updatedTitle })).toHaveCount(0);
});

test("Lijst: tekstfilter zoekt op bevat", async ({ page }) => {
  await page.getByRole("button", { name: "Lijst" }).click();
  await page.locator("#listTextFilter").fill("handdoeken");
  await expect(page.locator(".compact-task").filter({ hasText: "Handdoeken test draaien" })).toBeVisible();
  await expect(page.locator(".compact-task").filter({ hasText: "Morgen fruit klaarzetten" })).toHaveCount(0);
});

test("Subtaken en dark theme blijven bruikbaar", async ({ page }) => {
  // Combineert subtaken en themawissel omdat beide eerder visuele regressies gaven.
  await page.locator("article.task").filter({ hasText: "Konijnen test verzorgen" }).getByRole("button", { name: /Subtaken/ }).click();
  await expect(page.locator(".subtasks")).toBeVisible();
  await page.locator(".subtask").filter({ hasText: "Water" }).click();
  await expect(page.locator(".subtask.done").filter({ hasText: "Water" })).toBeVisible();

  await page.getByRole("button", { name: "Donker thema" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Deze week" }).click();
  await expect(page.getByRole("button", { name: "Vandaag" })).toBeVisible();
  await page.getByRole("button", { name: "Lijst" }).click();
  await expect(page.getByRole("heading", { name: "Lijst" })).toBeVisible();
});

test("Report toont audit-events", async ({ page }) => {
  // Report gebruikt een aparte HTML/JS-entry en moet los van de SPA blijven werken.
  await page.goto("/report/");
  await expect(page.locator("#reportStatus")).toHaveText("Geladen");
  await expect(page.locator("#reportCount")).toContainText("acties");
});
