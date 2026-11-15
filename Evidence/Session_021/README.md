# Session 021: To Do build 2, the items Colton picked

**Branch:** `todo-build2` · **Engineer:** Claude · **Approver:** Scott Dawson · **Date:** 15 Nov 2026
**Builds on:** Session 020 / AD-012 (migration 0031).

## What Colton asked for (15 Nov)
From the list in Scott's email, Colton picked:
- 1–3: Got Cards? replies, offers to answer, orders to ship
- 4–5: before and after shows
- 10–11: Weekly Headliner and Most Wanted

He skipped the inventory items (6–9); he already reprices and updates daily and weekly.

Scott's decisions:
- **Urgent email:** when a Got Cards? submission has waited about 20 hours (the promise is 24).
- **Orders paid before launch:** the six orders paid before 15 Nov (all Larry Brasiel's) are left out. Scott is asking Colton about them.

## What was built
| Item | How it works |
|---|---|
| 1 Got Cards? | Each `new` submission until it's answered. Shows the reply-by time and turns overdue at 24 h. **Urgent email at 20 h**, sent once. |
| 2 Offers | Each `pending` offer (below the auto-accept floor), with the card, the amount and the floor. Clears when answered. |
| 3 Orders | Each paid order not marked shipped, **paid from 15 Nov on**. Overdue after 2 days. Clears when marked shipped. |
| 4 Before a show | From the **website show schedule** (upcoming shows aren't in EndZone). Table shows only: "Pay the table fee" from 7 days out. "Record the fee" opens Record Expense and clears the card on save; "Already paid" also clears it. "Get ready" (pull inventory, check supplies) from 2 days out, with "Add the show" when there's no EndZone show that day. |
| 5 After a show | EndZone shows from 15 Nov that are over but still open: "Close <show>". The 8 older open shows appear as one Later card with **Close all**. |
| Drives | Shows on the website schedule (buying trips too) now prompt "Log the drive", unless they're already an EndZone show that day. A lot bought that day is covered by the same prompt. Trips gain `website_show_id`. |
| 10 Headliner | Due 7 days after the Headliner last changed (`headliner_changed_at`, stamped by a trigger). "Keep it another week" snoozes it for 7 days. |
| 11 Most Wanted | Due 7 days after the list last changed (`wanted_changed_at`, stamped on any insert, edit or delete). "Still good" snoozes it for 7 days. |

Other changes:
- The Website page opens a tab from `?tab=`.
- To Do clears a card from `?dismiss=` when a form returns to it.
- Return links may contain `:`.

## Verification
- **Replica tests:** `drizzle/tests/0032_todo_tests.sql` U1–U8 pass, and the 0031 suite (T1–T14) still passes with 0032 applied: 22 in total (`replica_test_run.txt`). The 0031 suite's setup now clears website-schedule shows, since 0032 adds prompts for them.
- **Type check:** clean. **Build:** passes. **Lint:** 0 errors in changed files. **Edge function:** `deno check` passes.
- **Full-app checks** at 390px against the scratch database, all 17 pass:
  - all 9 kinds listed
  - Record the fee → Record Expense (category filled) → back to To Do with the card cleared
  - Still good snoozes Most Wanted
  - Close all 2 closes the old shows
  - Headliner link and `?tab=wanted` open the right tabs
  - a buying-day drive is logged with `website_show_id` and the prompt clears
- Screens in `screens/`.

## Release (each step with Scott's OK)
1. Apply `0032_todo_business_items.sql` (connector) and check the function definitions against the tested build.
2. Redeploy `todo-email` (urgent subject and button for Got Cards?).
3. Regenerate `types.ts`.
4. Merge; Netlify publishes.
