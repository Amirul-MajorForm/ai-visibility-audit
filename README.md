# Website Audit: SEO and AI Visibility

Internal MajorForm tool that audits a website for **SEO**, for **AI visibility** (how easily ChatGPT, Claude, Gemini and Perplexity can find, read and understand it), or both, and produces a branded client report (HTML + PDF).

- **AI visibility (Layer 1):** AI crawler access, content AI can read without JavaScript, structured data, and whether the site answers what customers ask. Layer 2 (asking the AI models real questions) is planned.
- **SEO:** a crawl of up to 500 pages, indexing, on-page, site structure, mobile speed and technical checks, plus optional Semrush search data (authority, rankings, competitors, keyword ideas, backlinks) via Apify.

## Web app

Type a website in, watch the audit run, then explore the results (priorities, every check with filters, AI crawler access, pages reviewed) and download the branded client report as PDF. Past audits are listed on the home page.

```bash
npm install
APP_PASSWORD=choose-one npm start     # http://localhost:3000
```

### Deploy on Railway

1. In Railway: **New Project > Deploy from GitHub repo** and pick this repository (and the branch you want to deploy).
   Railway picks up `railway.json` and builds the `Dockerfile` (Playwright's image, which includes Chromium).
2. **Variables**: add `APP_PASSWORD` (the browser asks for it; any username works). Optionally add `APIFY_TOKEN` and `PAGESPEED_API_KEY` (see below).
3. **Volume**: add a volume mounted at `/data` so audits survive redeploys. Without it, past reports disappear on every deploy.
4. **Networking**: click **Generate Domain**.
5. Recommended: at least 1 GB of memory, since each audit runs a headless browser.

| Variable | Default | Purpose |
|---|---|---|
| `APP_PASSWORD` | none | Password for the whole app. Strongly recommended: without it anyone with the URL can run audits. |
| `APIFY_TOKEN` | none | Enables SEO search data (Semrush via the `pnda/semrush-keyword` Apify actor). Without it the option is greyed out. |
| `PAGESPEED_API_KEY` | none | Google PageSpeed Insights key for Lighthouse scores and real-user Core Web Vitals. Without it, speed is measured in our own browser. |
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
| `--audits ai,seo` | Which audits to run: `ai`, `seo` or both (default both) |
| `--client "Name"` | Override the client name shown in the report (otherwise taken from the site's structured data or title) |
| `--type <id>` | Business type instead of detecting it (e.g. `fitness`, `food`, `ecommerce`) |
| `--pages <n>` | SEO: maximum pages to crawl (default 150) |
| `--db <country>` | SEO search data country database (default `sg`) |
| `--no-search` | SEO: skip Semrush search data |
| `--out <dir>` | Output folder (default `reports/`) |
| `--no-pdf` | Skip the PDF |

Output goes to `reports/<domain>-<date>/`: `report.json`, `report.html`, `report.pdf`.
Running outside Docker needs Node 20+ and Playwright's Chromium (`npx playwright install chromium`).

## SEO audit

One crawl feeds both audits. The SEO audit adds:

| Category | Weight | Checks |
|---|---|---|
| Crawling & Indexing | 30 | Broken pages and links, internal links that redirect and redirect chains, noindex (and noindex pages listed in the sitemap), canonical tags, sitemap health, http/www versions redirecting to one address |
| On-page | 25 | Missing, duplicate, too long or too short titles and meta descriptions across the whole crawl; H1s; thin pages; exact duplicate pages; image alt text |
| Site Structure | 15 | Clicks from the homepage, sitemap pages nothing links to, weak internal linking, URL format |
| Speed & Mobile | 20 | Core Web Vitals from Google's real-user data and Lighthouse score (with `PAGESPEED_API_KEY`), otherwise LCP, CLS and page weight measured in our browser on a phone screen; viewport tag |
| Technical | 10 | HTTPS and mixed content, structured data that can earn rich results, HSTS, language |

The crawler follows internal links from the homepage (no query-string URLs, respects robots.txt), then checks sitemap URLs nothing linked to. Pages behind bot challenges are retried.

**Search data** (optional, needs `APIFY_TOKEN`): runs the `pnda/semrush-keyword` actor in three modes: domain overview (authority score, backlinks, ranking keywords, organic competitors), backlinks, and keyword ideas seeded from what the site says it offers. Each run has a hard spending cap (`maxTotalChargeUsd`), so an audit costs about US$0.20. Results are labelled as Semrush estimates and are **not** part of the score; if the actor fails or hits its daily limit, the audit still completes and says why. The data comes from a community actor that uses Semrush data without a Semrush subscription; review Semrush's terms before relying on it for client work.

**Views:** when both audits ran, the results page has a switch for *Both audits / AI visibility only / SEO only*. Each view shows only that audit's score, its own top priorities, checks and tabs, and the Client report and PDF buttons download that version (`report.pdf?view=seo` or `?view=ai`, built on first request and cached).

**Affected URLs:** a tab listing the URLs behind each issue (broken pages, duplicate titles and descriptions, missing or multiple H1s, thin and duplicate pages, redirects, noindex, canonical problems, deep or unlinked pages, and AI issues such as content hidden behind JavaScript). Each list can be filtered and downloaded as CSV, and every check links straight to its list ("View N affected URLs"). The PDF includes an appendix with up to 12 URLs per issue.

**Combined priorities:** checks that are the same fix in both audits (titles, meta descriptions, H1s, sitemap, canonical, HTTPS, structured data, speed, alt text, language) appear once in the priority list, tagged "SEO + AI visibility".

## What the AI visibility audit checks

The score (0 to 100) is a weighted average of five categories:

| Category | Weight | Checks |
|---|---|---|
| AI Crawler Access | 30 | robots.txt health; robots.txt rules for 13 AI/search crawlers (search, live browsing, training); live request as each crawler to catch CDN/firewall blocks; challenge or loading pages served instead of content |
| Content Visibility | 20 | Raw HTML vs fully rendered word count; key facts (prices, hours, phone, address, email) that only appear after JavaScript; booking, reservation and ordering widgets (Mindbody, Fresha, Calendly, Chope, OpenTable, SevenRooms, Oddle, etc.) |
| Content Clarity | 20 | Titles, meta descriptions, H1s, homepage depth, address, public pricing, hours, contact, FAQ content, essential pages, alt text, language |
| Structured Data | 15 | JSON-LD present and valid; specific business type for the category; key business fields (physical or online set); offers in the right format; FAQPage |
| Discoverability | 15 | Sitemap (and whether robots.txt references it), noindex, canonical, HTTPS, server response time, Open Graph; llms.txt reported but not scored |

The tool reviews the homepage plus up to 7 key pages it finds in the navigation, chosen to suit the business type. Blog posts are skipped.

### Business types

Each audit is judged against a business type, detected automatically from the site's structured data and homepage wording, or chosen in the form:

Fitness and wellness · Restaurant, cafe or bar · Beauty, salon or spa · Clinic or healthcare · Tuition, school or training · Hotel or accommodation · Shop or showroom · Online store · Software or tech · Professional or B2B services · Home and trade services · Other

The type decides which key pages are expected (e.g. menu and reservations for a restaurant, shipping and returns for an online store), whether address and opening hours matter, which schema.org types and fields are recommended, how much public pricing matters, and the examples used in the advice. Definitions live in `src/profiles.ts`. The results page shows what was detected, and you can re-run an audit as a different type.

### What AI sees vs what visitors see

Every reviewed page is read twice: as the raw HTML most AI crawlers receive, and in a full browser. The Pages tab shows the two side by side for each page: the text AI gets, and the text blocks (product names, prices, descriptions) that only appear after JavaScript runs. The client report includes the same comparison for the two pages with the biggest gap. If a detail such as a price differs between the two versions, it is flagged as "AI and visitors see different details". When some of the page's data fails to load in our browser, the comparison says the visitor view may be incomplete and no conflict is reported.

Pages that sometimes return a bot challenge or "loading" screen instead of content are retried, judged on their real content, and reported as their own finding.

Formats are tuned for Singapore (phone numbers, postal codes, S$ prices).

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
  profiles.ts       business types: detection, expected pages, schema and example copy
  widgets.ts        booking, reservation and ordering platform detection
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
