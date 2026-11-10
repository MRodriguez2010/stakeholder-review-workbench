# Stakeholder Review Workbench

A stakeholder can pin a correction to a specific section of a website, highlight an area on a phone or virtual desktop, and submit feedback. The reviewer’s choices appear in an owner dashboard with section-level counts, note details and a CSV export.

This public edition preserves the questionnaire, annotation tools, validation, database schema and reporting code from the Templo de Cristo client review project. The reviewed website is a fictional bilingual arts center with original CSS artwork. All review data is entered locally by the person running the demo.

## Run locally

Use Node.js 22.13 or newer. From a fresh checkout, build the local worker and initialize its development database once.

```sh
npm ci
npm run build
npx --no-install wrangler d1 execute DB --local --persist-to "$PWD/.wrangler/state" --config dist/server/wrangler.json --file drizzle/0000_flat_sunfire.sql
npm run dev -- --host 127.0.0.1
```

Follow the local URL printed at startup. The questionnaire lives at `/` and the local owner preview at `/insights`. Use sample comments in development.

## Follow a response

1. The reviewer pins a note or draws a highlight. The client records the named section and normalized coordinates for the selected layout.
2. The submission endpoint checks field lengths and marker geometry. A stable submission ID lets it handle retries, and the database writes the response and annotations together.
3. The dashboard groups responses and exports CSV with spreadsheet formula protection. The hosted code expects an authenticated Sites gateway and a server-side owner allowlist. Development mode exposes the local owner preview.

Run `npm test` to build the project and execute its rendering, questionnaire, authorization and export checks.
