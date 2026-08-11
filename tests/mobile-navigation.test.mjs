import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const headerPath = new URL("../app/site-header.tsx", import.meta.url);
const stylesPath = new URL("../app/globals.css", import.meta.url);

test("mobile navigation retains an accessible working toggle", async () => {
  const [header, styles] = await Promise.all([
    readFile(headerPath, "utf8"),
    readFile(stylesPath, "utf8"),
  ]);

  assert.match(header, /<button[\s\S]*?aria-expanded=\{mobileMenuOpen\}/);
  assert.match(header, /aria-controls="mobile-navigation-menu"/);
  assert.match(header, /className="burger-icon"/);
  assert.match(header, /icons\/medal\.svg/);
  assert.match(header, /icons\/lightbulb\.svg/);
  assert.match(header, /icons\/calendar-days\.svg/);
  assert.match(header, /icons\/users\.svg/);
  assert.match(header, /icons\/flag\.svg/);
  assert.match(header, /icons\/chart-no-axes-combined\.svg/);
  assert.match(header, /event\.key === "Escape"/);
  assert.doesNotMatch(header, /<details|<summary/);

  const hiddenRule = styles.lastIndexOf(
    '.site-header .mobile-navigation nav[data-open="false"]',
  );
  const visibleRule = styles.lastIndexOf(
    '.site-header .mobile-navigation nav[data-open="true"]',
  );
  assert.ok(hiddenRule >= 0);
  assert.ok(visibleRule >= 0);
  assert.match(styles.slice(visibleRule), /display:\s*grid/);
});

test("opposition summaries use parent clubs rather than individual XIs", async () => {
  const insights = await readFile(
    new URL("../app/insights/insights-explorer.tsx", import.meta.url),
    "utf8",
  );
  assert.match(insights, /const name = canonicalOpponent\(match\.opposition\)/);
  assert.doesNotMatch(insights, /function compactOpponent/);
});
