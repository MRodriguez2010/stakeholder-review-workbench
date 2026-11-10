import test from "node:test";
import assert from "node:assert/strict";
import { makeCsv } from "../app/insights/csv.ts";

test("exports one CSV row per note and safely escapes stakeholder text", () => {
  const csv = makeCsv([{
    id: "review-1",
    createdAt: "2026-08-21 01:45:00",
    scores: { overall: 4, readability: 2, navigation: 5, welcome: 4 },
    anythingElse: "=SUM(1,1) — Línea uno\nDice \"familia\".",
    annotations: [{
      id: "note-1",
      kind: "pin",
      sectionId: "hero",
      sectionLabel: "Bienvenida principal",
      category: "language",
      tone: "idea",
      comment: "Primero en inglés, luego español.",
      suggestion: "Use \"Welcome\".",
      viewport: "mobile:390x844",
      x: 0.125,
      y: 0.25,
      width: 0,
      height: 0,
      surface: "mobile",
    }],
  }]);

  const rows = csv.split("\r\n");
  assert.ok(rows[0].startsWith("\uFEFF"));
  assert.equal(rows[0].split(",").length, 20);
  assert.match(csv, /"Language","Idea"/);
  assert.match(csv, /"'=SUM\(1,1\) — Línea uno\nDice ""familia""\."/);
  assert.match(csv, /"Use ""Welcome""\."/);
  assert.match(csv, /"mobile:390x844"/);
  assert.match(csv, /"0\.125","0\.25","0","0"/);
});

test("exports reviews without placed notes", () => {
  const csv = makeCsv([{
    id: "review-empty",
    createdAt: "2026-08-21 01:46:00",
    scores: { overall: 5, readability: 5, navigation: 5, welcome: 5 },
    anythingElse: "",
    annotations: [],
  }]);

  assert.equal(csv.split("\r\n").length, 2);
  assert.match(csv, /"review-empty"/);
  assert.match(csv, /,"0","","","","","","","","","","","",""$/);
});

test("neutralizes common spreadsheet formula prefixes", () => {
  const review = {
    id: "review-formula",
    createdAt: "2026-08-21 01:47:00",
    scores: { overall: 5, readability: 5, navigation: 5, welcome: 5 },
    anythingElse: " @SUM(1,1)",
    annotations: [{
      id: "note-formula",
      kind: "highlight",
      sectionId: "hero",
      sectionLabel: "+cmd",
      category: "other",
      tone: "concern",
      comment: "\t=2+2",
      suggestion: "-1+1",
      viewport: "desktop:1280x9000",
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.4,
      surface: "desktop",
    }],
  };

  const csv = makeCsv([review]);
  assert.match(csv, /"' @SUM\(1,1\)"/);
  assert.match(csv, /"'\+cmd"/);
  assert.match(csv, /"'\t=2\+2"/);
  assert.match(csv, /"'-1\+1"/);
});
