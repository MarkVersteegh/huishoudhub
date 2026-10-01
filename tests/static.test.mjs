import assert from "node:assert/strict";
import { baseUrl, startTestServer, stopTestServer } from "./helpers/pocketbase-test-server.mjs";

let server;
try {
  server = await startTestServer();
  // De recente laadbug kwam door een verkeerd MIME-type; deze check bewaakt dat expliciet.
  const appScript = await fetch(baseUrl + "/app.js?v=test");
  assert.equal(appScript.status, 200);
  assert.match(appScript.headers.get("content-type") || "", /javascript/);

  const moduleScript = await fetch(baseUrl + "/js/config.js");
  assert.equal(moduleScript.status, 200);
  assert.match(moduleScript.headers.get("content-type") || "", /javascript/);

  const html = await fetch(baseUrl + "/").then((res) => res.text());
  // De app mag modules gebruiken, maar niet terugvallen naar .mjs dat PocketBase verkeerd serveert.
  assert.match(html, /type="module"/);
  assert.doesNotMatch(html, /\.mjs/);

  // Help-pagina moet bereikbaar zijn vanuit de app en terug kunnen linken.
  assert.match(html, /href="\/help\/"/);
  const help = await fetch(baseUrl + "/help/");
  assert.equal(help.status, 200);
  const helpHtml = await help.text();
  assert.match(helpHtml, /Hoe werkt HuishoudHub\?/);
  assert.match(helpHtml, /href="\/"/);
} finally {
  await stopTestServer(server);
}

console.log("Static checks geslaagd");
