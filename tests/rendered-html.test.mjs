import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

function executionContext() {
  return { waitUntil() {}, passThroughOnException() {} };
}

test("renders the church website with the stakeholder review layer", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    executionContext(),
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Casa del Patio \| Stakeholder Website Review<\/title>/i);
  assert.match(html, /<html[^>]+lang="es"/i);
  assert.match(html, /Bienvenidos a/i);
  assert.match(html, /data-review-section="hero"/i);
  assert.match(html, /name="robots" content="noindex, nofollow"/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("ships the requested Spanish questionnaire flow and desktop review surface", async () => {
  const [route, client, css] = await Promise.all([
    readFile(new URL("../app/api/reviews/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/review-layer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(route, /export\s+async\s+function\s+GET/);
  assert.match(route, /await request\.text\(\)/);
  assert.match(route, /new TextEncoder\(\)\.encode\(rawBody\)\.byteLength > 160_000/);
  assert.match(route, /startsWith\("application\/json"\)/);
  assert.match(route, /typeof parsed !== "object" \|\| Array\.isArray\(parsed\)/);
  assert.match(route, /x \+ width > 1\.000001 \|\| y \+ height > 1\.000001/);
  assert.match(route, /submissionId/);
  assert.match(route, /INSERT OR IGNORE/);
  assert.match(route, /rawAnnotations\.length > 50/);
  assert.match(route, /cleanText\(payload\.website, 200\)/);
  assert.match(route, /INTO reviews/);
  assert.match(route, /INTO annotations/);
  assert.match(route, /await db\.batch\(statements\)/);
  assert.match(client, /maxLength=\{1200\}/);
  assert.match(client, /Modo de revisión · No es el sitio final/);
  assert.match(client, /El inglés será el idioma principal para la carga inicial y los buscadores/);
  assert.match(client, /Primera impresión general/);
  assert.match(client, /El texto fue cómodo de leer/);
  assert.match(client, /La información para visitar fue fácil de encontrar/);
  assert.match(client, /El sitio se sintió acogedor y confiable/);
  assert.match(client, /<h3>¿Algo más\?<\/h3>/);
  assert.doesNotMatch(client, /About you|Acerca de ti|Which language should/i);
  assert.match(client, /desktop:\$\{DESKTOP_WIDTH\}/);
  assert.match(client, /DESKTOP_CAPTURE_HEIGHT/);
  assert.match(client, /viewport: `\$\{captureSurface\}:\$\{window\.innerWidth\}x\$\{window\.innerHeight\}:live`/);
  assert.match(client, /Comentar sobre escritorio|>Comentar</);
  assert.match(client, /setMode\(isEmbedded \? "embedded" : "review"\)/);
  assert.match(client, /requestAnimationFrame/);
  assert.match(client, /draftReady/);
  assert.match(client, /Array\.isArray\(parsed\)/);
  assert.match(client, /isDesktopPreviewAnnotation/);
  assert.match(client, /annotations\.findIndex/);
  assert.match(client, /crypto\.randomUUID\(\)/);
  assert.match(client, /patio-review-submission-id/);
  assert.match(client, /AbortController/);
  assert.match(client, /aria-pressed=\{candidate\.tone === option\.value\}/);
  assert.match(client, /role="dialog" aria-modal="true" aria-label="Completar revisión del sitio"/);
  assert.match(client, /document\.querySelector<HTMLElement>\("main"\)/);
  assert.match(client, /classList\.add\("review-embed-mode"\)/);
  assert.match(css, /\.review-embed-mode \.hero \{ min-height: 856px; \}/);
  assert.match(css, /--review-charcoal/);
  assert.match(css, /--review-blue/);
  assert.match(css, /--review-green/);
  assert.match(css, /\.review-rating-row button \{ width: 44px; height: 44px/);
});

test("protects the insights dashboard before loading private response data", async () => {
  const [page, auth, data, dashboard, websiteResponse, insightsCss] = await Promise.all([
    readFile(new URL("../app/insights/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/insights-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/insights/data.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/insights/insights-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/insights/website-response-view.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/insights/insights.module.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /dynamic = "force-dynamic"/);
  assert.doesNotMatch(page, /["']use client["']/);
  assert.ok(page.indexOf("requireInsightsOwnerPage()") < page.indexOf("loadInsights()"));
  assert.match(auth, /requireChatGPTUser\("\/insights"\)/);
  assert.match(auth, /INSIGHTS_OWNER_EMAILS/);
  assert.match(auth, /allowed\.length === 0/);
  assert.match(auth, /notFound\(\)/);
  assert.match(data, /FROM reviews/);
  assert.match(data, /LEFT JOIN annotations/);
  assert.match(data, /websiteReviews\.slice\(0, 100\)/);
  assert.match(data, /websiteReviews,/);
  assert.match(data, /GROUP BY section_id\s+ORDER BY/);
  assert.doesNotMatch(data, /GROUP BY section_id, section_label/);
  assert.match(data, /ORDER BY r\.created_at DESC, r\.rowid DESC, a\.rowid/);
  assert.match(data, /a\.rowid/);
  assert.match(data, /a\.width/);
  assert.match(dashboard, /Export shown CSV/);
  assert.match(dashboard, /Owner only/);
  assert.match(dashboard, /surfaceFilter/);
  assert.match(dashboard, /timeZone: "America\/Chicago"/);
  assert.match(dashboard, /return new Date\(Number\.NaN\)/);
  assert.match(dashboard, /document\.body\.append\(anchor\)/);
  assert.match(dashboard, /aria-pressed=\{surfaceFilter === filter\}/);
  assert.match(dashboard, /geometryText/);
  assert.match(dashboard, /router\.refresh\(\)/);
  assert.match(dashboard, /WebsiteResponseView/);
  assert.match(dashboard, /data\.websiteReviews/);
  assert.match(websiteResponse, /const frameSrc/);
  assert.match(websiteResponse, /"\/\?embed=desktop"/);
  assert.match(websiteResponse, /"\/\?embed=website-response"/);
  assert.match(websiteResponse, /reviews\.slice\(0, responseLimit\)/);
  assert.match(websiteResponse, /Load more responses/);
  assert.match(websiteResponse, /frameWindow\.scrollTo/);
  assert.match(websiteResponse, /behavior: "instant"/);
  assert.match(websiteResponse, /loadedFrameKey !== frameKey/);
  assert.match(websiteResponse, /event\.key !== "Escape"/);
  assert.match(websiteResponse, /capturedViewport/);
  assert.match(websiteResponse, /rawHeight > 2400/);
  assert.match(websiteResponse, /Math\.max\(1, item\.annotation\.width/);
  assert.match(websiteResponse, /attributeFilter: \["class"\]/);
  assert.match(websiteResponse, /setDetailId\(null\)/);
  assert.match(websiteResponse, /setDetailId\(item\.annotation\.id\)/);
  assert.match(websiteResponse, /Questionnaire details/);
  assert.match(websiteResponse, /Close response details/);
  assert.match(websiteResponse, /setPanelOpen\(false\)/);
  assert.match(websiteResponse, /Open response panel/);
  assert.match(insightsCss, /\.websiteResponsePanel \{ position: fixed/);
  assert.match(insightsCss, /\.websitePanelClosed \{ visibility: hidden; transform: translateX/);
  assert.match(insightsCss, /\.websiteDetailCard \{ position: fixed/);
});

test("ships the review and annotation schema with useful indexes", async () => {
  const [schema, migration, hosting] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0000_flat_sunfire.sql", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);

  assert.match(schema, /sqliteTable\("reviews"/);
  assert.match(schema, /sqliteTable\("annotations"/);
  assert.match(migration, /CREATE TABLE `reviews`/);
  assert.match(migration, /CREATE TABLE `annotations`/);
  assert.match(migration, /idx_annotations_review_id/);
  assert.match(migration, /idx_reviews_created_at/);
  assert.match(migration, /PRAGMA optimize/);
  assert.equal(JSON.parse(hosting).d1, "DB");
});
