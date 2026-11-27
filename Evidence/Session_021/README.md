# Session 021: You vs the Market (Dashboard market tracker)

**Branch:** `market-tracker` · **Engineer:** Claude · **Approver:** Scott Dawson · **Date:** 27 Nov 2026
**Design (Scott, 27 Nov, in chat):** benchmark = GemRate's monthly eBay sports-card singles total; a Dashboard card; new months added by a monthly scheduled task.

## What was built
| Area | Pieces |
|---|---|
| Database (`drizzle/migrations/0039_market_benchmark.sql`) | Table `market_benchmarks` (series, month, value_usd, source_url, source_note). Signed-in users can read it; there are no write policies, and anon has no access. Seeded Sep 2025 – Jul 2026 (11 months) from published GemRate figures, each with its source link. Function `get_market_comparison(p_user_id, p_months default 18)`: monthly sales (same rule and date convention as `get_period_series`), the market figure, and both as an index where 100 = the average of the first three full months that have both. The month of the first recorded sale is skipped, because record-keeping started part-way through Oct 2025 ($1,249). |
| Dashboard | New "You vs the Market" section after Trend. It shows the latest month with both figures as % vs base, a two-line chart (this month left out until it ends), "November so far", the months still waiting for a market figure, and "See every month": a table of sales, market $ (linked to its source) and both indexes. |
| Tooltip | `kpiTooltips.marketComparison`. |

## Market data gaps
- Jul and Aug 2025 were only published as part of the H2 2025 total, so no single-month figure was found.
- Aug, Sep and Oct 2026 had not turned up in public reports as of 27 Nov. GemRate's own sales-trends page has per-athlete data through Oct 2026, but it only renders in a browser, and the desktop browser disconnected before the totals could be read.
- The scheduled task fills these when it finds them.

## Verification
- **Replica tests** (`drizzle/tests/0039_replica_setup.sql` + `0039_market_tests.sql`): 23 checks, all pass (`replica_test_run.txt`). They cover the 18/12/36-month windows; no sales figure before the first sale and $0 for empty months; base months (first-sale month skipped); index arithmetic; deleted sales and dispositions ignored; this month marked partial; the mentor sees the same as Colton; another user sees none of Colton's sales; the table is readable but not writable when signed in; anon can neither read it nor run the function; the month/value constraints; the migration runs twice cleanly.
- **Production preview (read-only):** the function's query was run against Colton's live data with the seed values inlined. The base is Nov 2025–Jan 2026 (avg $5,493 a month; market $175M). July 2026: Colton 248, market 166.
- **Type check:** clean. **Build:** passes. **Lint:** 0 errors in the new file.
- **Mobile:** `market_390.png` shows the section rendered at 390px from those preview numbers (mocked data layer).

## Release (each step with Scott's OK)
1. Apply 0039 to production.
2. Merge the PR (Netlify deploys `main`).
3. Monthly scheduled task (around the 16th) that adds the new GemRate month and backfills gaps.
