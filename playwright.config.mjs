import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  // Playwright mag alleen echte browser-specs oppakken; Node-tests draaien via npm scripts.
  testMatch: "**/*.spec.mjs",
  timeout: 30000,
  expect: { timeout: 7000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:8091",
    // Gebruik de lokaal geïnstalleerde Chrome in plaats van een Playwright-browserdownload.
    channel: "chrome",
    trace: "retain-on-failure",
  },
  projects: [
    // Desktop is de snelle smoke-target en de brede layout.
    {
      name: "chromium-desktop",
      use: {
        browserName: "chromium",
        viewport: { width: 1280, height: 900 },
      },
    },
    // Tablet benadert de oude iPad/muurtablet waarop de app veel gebruikt wordt.
    {
      name: "tablet",
      use: {
        browserName: "chromium",
        viewport: { width: 795, height: 1078 },
      },
    },
    // Mobile vangt bottom-nav en smalle formulierproblemen af.
    {
      name: "mobile",
      use: {
        browserName: "chromium",
        isMobile: true,
        hasTouch: true,
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
