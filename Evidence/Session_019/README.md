# Session 019 — Round 4: Tax tracker, four accounts, reminders

**Branch:** `round4-tax-accounts` (not merged; ships after the Sunday 11 Oct cutover with Scott's approval)
**Engineer:** Claude (direct to GitHub; no Lovable)
**Approver:** Scott Dawson
**Dates:** 10 Oct 2026

## What was built
| Area | Pieces |
|---|---|
| Database (`drizzle/migrations/0004_round4_tax_accounts_reminders.sql`) | tax_payment and interest cash types; lots.account_id; money_settings, account_reconciliations, reminders_state tables; get_tax_tracker, record_tax_payment, record_reconciliation, get_account_statement, get_reminders, complete_money_setup, tax_estimate_schedule, tax_quarter_paid; anon EXECUTE lockdown |
| Tax screen (`/tax`) | Position (behind / ahead / up to date), "I sent $X to Tax", Tax balance, next estimated payment, week-by-week list, payments this year, "Add to my calendar" (.ics) |
| Accounts | Statement per account (`/accounts/:id`) with running balance; "Check vs bank" with server-computed difference and noted adjustments; first-use setup (`/accounts/setup`) |
| Entry forms | Expense account follows category; lot "Paid from"; Money In/Out type picker with Interest; exact string amounts (TD-007) |
| Dashboard | Tax tile; reminder cards (setup, weekly transfer, estimated tax, monthly bank check, year-end, PA annual report); mentor Weekly call card |

## Verification
- **Replica tests:** 22 tests (T1–T22, 23 PASS notices) on a restore of the 10 Oct production export with 0004 applied. All pass. See `replica_test_run.txt`.
  - T1 checks the tracker against an independent weekly calculation: 2026 owed through the week ending 4 Oct = **$2,132.95**.
  - T8–T10 and T20 cover access: the mentor can read but not write, an unrelated user sees nothing, and logged-out visitors can run no functions and see no rows.
  - T15 runs first-use setup end to end, checks balances and the total cash delta, and confirms a second run is refused.
- **Type check:** `tsc --noEmit` is clean (`tsc.txt`). **Build:** passes (`build.txt`).
- **Lint:** no new errors. The 8 errors in Dashboard.tsx are already on main.
- **Calendar file:** sample output is in `sample_calendar_output.txt` (RFC 5545 folding and escaping).

## Independent review
A separate agent that had not seen the work reviewed the diff, probed a scratch database, and then re-verified the fixes.
- **Round 1:** 0 critical, 2 high, 3 medium, 5 low.
  - High 1: money moved back out of Tax was ignored.
  - High 2: completed weeks showed "Open" when the Monday transfer landed in the new week.
  - Medium: an IRS-only payment cleared the PA reminder; the future-function lockdown didn't work; the payment dialog defaulted to the wrong quarter.
  - All fixed in d964384, with tests T16–T20.
- **Round 2 (re-check):** all 10 fixed. It found 3 new issues:
  - Tax bank-check adjustments moved the position.
  - The PA requirement could nag forever.
  - A side effect of the database-wide default-privilege change.
  - The first two were fixed in 2ec406e (T21, T22). The third is documented in the migration: functions created outside public/storage by postgres need an explicit grant.

## Not yet done
- **Phone screenshots at 390px:** these need 0004 on a live Supabase. Planned for after cutover: apply 0004 with Scott's OK, then run a Netlify branch preview.
- **iPhone calendar:** "Add to my calendar" on iOS opens the calendar data directly. Test it on Colton's phone.
- **`src/integrations/supabase/types.ts`:** the new tables and functions were added by hand. Regenerate it from the live schema after 0004 is applied.

## Release steps (after cutover)
1. Scott approves. Apply 0004 to the EndZone Supabase project (`dtfizpxtpsmqqzpactdh`) in the SQL editor.
2. Run `drizzle/tests/round4_replica_tests.sql` against a restore. Never run it on production; the tests roll back, but they use real user IDs.
3. Merge `round4-tax-accounts` into main. Netlify deploys.
4. Colton opens Tax or Accounts and completes first-use setup.
