# AI Visibility Audit

Internal MajorForm tool that checks how easily AI assistants (ChatGPT, Claude, Gemini, Perplexity) can find, read and understand a website, and produces a branded client report (HTML + PDF).

This is **Layer 1: technical readiness**. Layer 2 (asking the AI models real customer questions and measuring share of voice) is planned.

## Web app

Type a website in, watch the audit run, then view the report in the browser and download the PDF. Past audits are listed on the home page.

```bash
npm install
APP_PASSWORD=choose-one npm start     # http://localhost:3000
```

### Deploy on Railway

1. In Railway: **New Project > Deploy from GitHub repo** and pick this repository (and the branch you want to deploy).
   Railway picks up `railway.json` and builds the `Dockerfile` (Playwright's image, which includes Chromium).
2. **Variables**: add `APP_PASSWORD`. The browser will ask for it (any username works).
3. **Volume**: add a volume mounted at `/data` so audits survive redeploys. Without it, past reports disappear on every deploy.
4. **Networking**: click **Generate Domain**.
5. Recommended: at least 1 GB of memory, since each audit runs a headless browser.

| Variable | Default | Purpose |
|---|---|---|
| `APP_PASSWORD` | none | Password for the whole app. Strongly recommended: without it anyone with the URL can run audits. |
| `DATA_DIR` | `/data` in Docker, `./data` locally | Where audits and reports are stored |
| `MAX_CONCURRENT_AUDITS` | `1` | Audits run one at a time; extra requests queue |
| `DNS_CHECK` | on | Set to `off` only behind an outbound proxy where local DNS does not resolve |

The app refuses private and internal network addresses, so it cannot be used to probe Railway's own network.

## Command line

```bash
npm run audit -- https://example.sg
```

| Flag | Purpose |
|---|---|
| `--client "Name"` | Override the client name shown in the report (otherwise taken from the site's structured data or title) |
| `--out <dir>` | Output folder (default `reports/`) |
| `--no-pdf` | Skip the PDF |

Output goes to `reports/<domain>-<date>/`: `report.json`, `report.html`, `report.pdf`.
Running outside Docker needs Node 20+ and Playwright's Chromium (`npx playwright install chromium`).

## What it checks

The score (0 to 100) is a weighted average of five categories:

| Category | Weight | Checks |
|---|---|---|
| AI Crawler Access | 30 | robots.txt health; robots.txt rules for 13 AI/search crawlers (search, live browsing, training); live request as each crawler to catch CDN/firewall blocks |
| Content Visibility | 20 | Raw HTML vs fully rendered word count; key facts (prices, hours, phone, address, email) that only appear after JavaScript; booking/timetable widgets (Mindbody, Glofox, Vibefam, Momence, etc.) |
| Content Clarity | 20 | Titles, meta descriptions, H1s, homepage depth, address, public pricing, hours, contact, FAQ content, essential pages, alt text, language |
| Structured Data | 15 | JSON-LD present and valid; business typed as ExerciseGym/LocalBusiness; 10 business fields; offers/services; FAQPage |
| Discoverability | 15 | Sitemap (and whether robots.txt references it), noindex, canonical, HTTPS, server response time, Open Graph; llms.txt reported but not scored |

The tool reviews the homepage plus up to 7 key pages it finds in the navigation (pricing, schedule, classes, about, FAQ, contact, trial). Blog posts are skipped.

Checks are tuned for Singapore fitness studios (SG phone and postal code formats, S$ prices, fitness schema types, studio booking platforms) but work for any local business.

## Project layout

```
src/
  web/              web app: server, job queue, pages, URL safety checks
  audit.ts          runs one audit and writes the report files (used by web app and CLI)
  cli.ts            command-line entry point
  crawl.ts          fetches pages, robots.txt, sitemap; picks key pages; live crawler tests
  http.ts           fetch with manual redirects (detects loops) and proxy support
  render.ts         Playwright rendering
  page.ts           HTML parsing, fact extraction
  bots.ts           AI crawler list (tokens, user agents, purpose)
  widgets.ts        booking platform detection
  checks/           one file per category; all client-facing copy lives here
  score.ts          category weights, overall score, priorities, summary
  brand.ts          MajorForm colours, fonts, name
  report/           HTML report, PDF export, embedded fonts and logo
```

## Branding

Colours and fonts (Space Grotesk, DM Sans) come from majorform.co and are set in `src/brand.ts`. Fonts are embedded in the report so it renders the same offline and in PDF. To use the real logo instead of the text wordmark, add:

- `assets/brand/logo-light.svg` (or `.png`): for the dark cover
- `assets/brand/logo.svg` (or `.png`): for light backgrounds

## Caveats

- Live crawler tests imitate each crawler's user agent from our machine. Some firewalls verify real crawlers by IP address, so a block (or a pass) should be confirmed in the client's CDN settings.
- Response time is measured from wherever the tool runs.
- Off-site signals (Google Business Profile, reviews, directories, Reddit) are not scored yet.
