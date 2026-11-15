# Session 020: To Do list, monthly checkup, mileage log, tasks, To Do email

**Branch:** `todo-checkup` (not merged; release steps below need Scott's OK)
**Engineer:** Claude · **Approver:** Scott Dawson · **Date:** 15 Nov 2026
**Design:** project doc `claude/ToDo_and_Monthly_Checkup_Design.md` (approved 15 Nov) · **AD-012**

## What was built
| Area | Pieces |
|---|---|
| Database (`drizzle/migrations/0031_todo_checkup_trips.sql`) | Tables: `trips`, `tasks`, `monthly_checkups`, `mileage_rates`, `todo_email_log`; `money_settings.weekly_email`. Functions: `get_todo`, `get_checkup`, `complete_checkup`, `get_checkup_status`, `checkup_done`, `trip_prompts`, `get_mileage_summary`, `last_sunday_of_month`, `mileage_rate_for`, `todo_email_pending`, `todo_email_mark`, `todo_email_tick`. `get_reminders` changed in one place: a bank check on or after the previous month's last Sunday counts. |
| To Do (`/todo`) | Now / This week / Later. Reminders, the checkup, drive prompts and tasks in one list. Add a task, log a drive, Sunday email switch. Dashboard shows the top 3 Now items; the menu has a To Do badge. |
| Checkup (`/checkup/:period`) | One step per screen: what the app found (booth fees, open shows, categories that dropped out, $75+ without a receipt, drives), 8 questions (9 the first time, with the catch-up for drives since Oct 12), bank check of each account, summary, finish. "Yes" opens the usual entry form, which returns to the checkup. |
| Mileage log (`/trips`) | Drives by year with month totals, an estimated deduction at the IRS rate for each drive's date (72.5¢ to June 2026, 76¢ from July 1), CSV for the accountant, and the gas-vs-mileage note. |
| Tasks | Colton adds, edits, completes. Scott (mentor view) adds to Colton's list and edits or deletes only his own; only Colton can mark done (database trigger). |
| Email (`supabase/functions/todo-email`) | Hourly from pg_cron. Sunday digest from 6 pm ET (skipped when empty or switched off); urgent emails for estimated tax due within 3 days and tasks marked urgent. Each goes once (`todo_email_log`). |
| Weekly call card (mentor) | New "Monthly checkup" line: done or not, and when. No answers. |
| Forms | Record Expense, Money In/Out, sale entry and Disposition accept `?returnTo=` (same-app paths only). Record Expense also accepts `category`, `date`, `paid=1`. |

## Verification
- **Replica tests** (`drizzle/tests/0031_todo_tests.sql`): 14 tests, all pass (`replica_test_run.txt`), on a scratch Postgres with every migration applied and Supabase's default grants reproduced. The suite can be run again on the same database.
  - T1 last Sunday, including months that end on a Sunday (May 2026, Feb 2027)
  - T2–T3 the checkup appears on its last Sunday, stays until done, snoozes, and looks the same to the mentor
  - T4 checkup rows: written once, can't be edited or inserted directly, owner-only; the mentor gets only month and date
  - T5–T6 drive prompts: from launch day, for 21 days, not for shipped lots; cleared by a trip or "No drive"; Got Cards? meetups use the seller's name
  - T7 trips: no future dates, no other user's show, edits counted; the mentor can read but not write
  - T8 tasks: mentor rights, owner-only "done", no moving lists, unrelated user sees nothing
  - T9 bank check: counts from the previous month's last Sunday; To Do folds the checks into an open checkup, otherwise one card
  - T10 checkup flags; another user sees only their own
  - T11–T12 email: Sunday 6 pm only, once; urgent once; switch off; a finished checkup leaves the digest; estimated tax 3 days out
  - T13 mileage deduction uses each date's rate
  - T14 logged-out visitors can run none of the new functions; signed-in users can't call the email functions
- **Production comparison:** before 0031, the live `get_reminders` and `record_reconciliation` were confirmed identical (md5) to the replica's. The live cron jobs are `big-games` and `sync-refunds`.
- **Type check:** clean (`tsc.txt`). **Build:** passes (`build.txt`). **Lint:** 0 errors in new files; the 26 errors in the touched existing files were there before. **Edge function:** `deno check` passes.
- **Functional + mobile:** `functional_checks.txt` and `screens/` (390px). 15 checks pass for Colton and for Scott in mentor view. These were run on the full app against the scratch database.
- **Bug found and fixed:** a show passed to Record Expense in the link was dropped while the show list loaded. This also affected the existing link from a show page.

## Release (each step with Scott's OK)
1. Apply `0031_todo_checkup_trips.sql` in the Supabase SQL editor (or through the connector if it accepts it).
2. Deploy the `todo-email` Edge Function with JWT verification off, as with `sync-refunds`; then run `SELECT cron.schedule('todo-email', '31 * * * *', 'select public.todo_email_tick()');`
3. Regenerate `src/integrations/supabase/types.ts` from the live schema. It was hand-edited on this branch for the new tables and functions.
4. Merge `todo-checkup`; Netlify publishes.
5. Add the two starter tasks (package-insert cards; Google Business Profile).
6. First checkup: Sunday 29 Nov. First digest: that evening.

Note: a Netlify branch preview of this branch reads production, so `/todo` there fails until step 1 is done.
