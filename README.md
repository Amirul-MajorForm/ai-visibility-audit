# AI Visibility Audit

Internal MajorForm tool that checks how easily AI assistants (ChatGPT, Claude, Gemini, Perplexity) can find, read and understand a website, and produces a branded client report (HTML + PDF).

This is **Layer 1: technical readiness**. Layer 2 (asking the AI models real customer questions and measuring share of voice) is planned.

## Usage

```bash
npm install
npm run audit -- https://example.sg
```

Options:

| Flag | Purpose |
|---|---|
| `--client "Name"` | Override the client name shown in the report (otherwise taken from the site's structured data or title) |
| `--out <dir>` | Output folder (default `reports/`) |
| `--no-pdf` | Skip the PDF |

Output goes to `reports/<domain>-<date>/`: `report.json`, `report.html`, `report.pdf`.

Requires Node 20+ and Playwright's Chromium (`npx playwright install chromium` on a fresh machine).

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
  cli.ts            entry point
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
