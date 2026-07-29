import assert from "node:assert/strict";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders The Inch Park Vault", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>The Inch Park Vault<\/title>/i);
  assert.match(html, /Opening the vault/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("server-renders the match archive", async () => {
  const response = await render("/matches");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /<title>Match archive \| The Inch Park Vault<\/title>/i);
  assert.match(html, /Opening the Vault/i);
  assert.match(html, /href="\/matches\/"/i);
});

test("server-renders a permanent scorecard route", async () => {
  const response = await render("/matches/925531");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /Falkland CC/i);
  assert.match(html, /925531/);
  assert.match(html, /Opening the scorecard/i);
});
