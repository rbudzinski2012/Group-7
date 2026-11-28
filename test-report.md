# Test Report – Subscription Tracker (Group 7)

**Tested by:** Brendan Fuller (Lead, Full Stack Integration & Testing)
**Date:** November 28, 2026
**Commit under test:** `337ac45` (main, after PR #6)
**Environment:** Node.js 22.23, Express 4.21, better-sqlite3 11.3, Chromium (headless)

## How to run the tests

```bash
npm install
npm run seed          # loads the four fictional baseline records
npm test              # runs validation-test.js and api-test.js (44 automated tests)
```

`api-test.js` starts the real server on a throwaway SQLite file, so it never
touches `data/subscriptions.db`.

## Summary

| # | Test (Proposal Section 8) | Owner | Result |
|---|---|---|---|
| 1 | Financial Result ($10 weekly = $520) | Remington Budzinski | PASS |
| 2 | Complete Workflow (add Spotify, cancel, +$143.88) | Shena Parks | PASS |
| 3 | Repeated Status Toggle (no double counting) | Pushpa Rathina | PASS |
| 4 | Invalid Input (API 400 JSON, frontend error) | Brendan Fuller | PASS |
| 5 | Endpoint Verification (PUT / DELETE / 404) | Ivette Touzalin-Awadallah | PASS |
| 6 | Persistence (real server restart) | Pushpa Rathina | PASS |
| – | Safe display of names (instructor finding) | Ivette Touzalin-Awadallah | FAIL before fix, PASS after fix (see below) |

Automated: `validation-test.js` 12/12 pass, `api-test.js` 32/32 pass.

## 1. Financial Result

**Input:** `npm run seed` (Netflix $15.99 monthly, Amazon Prime $139.00 annual,
Gym Weekly Pass $10.00 weekly, Cloud Storage Pro $29.99 quarterly paused).

| Metric | Expected | Observed |
|---|---|---|
| Active Annual Outflow | $850.88 | $850.88 |
| Monthly Outflow Equivalent | $70.91 | $70.91 |
| Reclaimed Annual Savings | $0.00 | $0.00 |
| Active Subscriptions | 3 / 4 | 3 / 4 |
| Gym Weekly Pass annualized | $520.00 / yr, $43.33 / mo | $520.00 / yr, $43.33 / mo |
| Amazon Prime monthly equivalent | $11.58 (13900 / 12 = 1158.33, half-up) | $11.58 |

**Result: PASS.** Screenshot: `screenshots/01_financial_result_seed.png`

## 2. Complete Workflow (browser → API → database → dashboard)

**Input:** In the Add Subscription modal enter Spotify, $11.99, Monthly,
Entertainment, Active. Then click **Cancel Service** on the Spotify row.

| Step | Expected | Observed |
|---|---|---|
| POST /api/subscriptions | 201, `annual_cents: 14388` | 201, `annual_cents: 14388` |
| Dashboard after add | $994.76 outflow, 4 / 5 active | $994.76 outflow, $82.90 monthly, 4 / 5 |
| PATCH status → canceled | 200, `savings_delta_cents: 14388` | 200, `savings_delta_cents: 14388` |
| Dashboard after cancel | Savings $143.88, outflow back to $850.88, 3 / 5 | Savings $143.88, outflow $850.88, 3 / 5 |
| Audit log | `active → canceled +$143.88 saved` | shown in Lifecycle Audit Log panel |

**Result: PASS.** Screenshots: `02_workflow_modal_spotify.png`,
`03_workflow_after_add.png`, `04_workflow_spotify_canceled.png`

## 3. Repeated Status Toggle

**Input:** On Spotify (canceled) click **Reactivate**, then **Cancel Service**
again. Also PATCH `canceled → paused` and the same status twice.

| Case | Expected | Observed |
|---|---|---|
| canceled → active → canceled | Savings stays $143.88 (not $287.76) | $143.88 |
| Audit log deltas | +14388, −14388, +14388 | +14388, −14388, +14388 |
| canceled → paused | Savings $0.00, outflow unchanged ($850.88) | $0.00, $850.88 |
| PATCH same status twice | 200, delta 0, no new audit row | 200, delta 0, no new row |

**Result: PASS.** Screenshot: `05_repeated_toggle.png`

## 4. Invalid Input

**Frontend:** The modal blocks submission and shows a red error for an empty
name, a cost of $0, a cost over $10,000, and more than two decimal places.
Observed message for $0: "Cost must be at least $0.01."
Screenshot: `06_invalid_input_frontend.png`

**API (direct `curl` to POST /api/subscriptions):** every case below returned
HTTP 400 with a JSON `{ "error": ... }` body and inserted nothing.

| Payload | Observed |
|---|---|
| `amount_cents: "1500"` (string) | 400 – Cost must be a positive integer in cents |
| `amount_cents: true` (boolean) | 400 – same (previously stored as 1¢, now rejected) |
| `amount_cents: -100` / `0` / `15.5` | 400 |
| `amount_cents: 1000001` | 400 – Cost cannot exceed $10,000.00 |
| `name: "   "` / 101 characters | 400 |
| `frequency: "daily"` / `status: "deleted"` | 400 |
| `category_id: "1"` (string) / `99` (missing) | 400 |
| array body `[1,2,3]` | 400 – Request body must be a JSON object |
| malformed JSON `{bad json` | 400 JSON (no HTML stack trace) |
| PATCH `status: "deleted"` / id `abc` | 400 |

**Result: PASS.**

## 5. Endpoint Verification

| Request | Expected | Observed |
|---|---|---|
| PUT /api/subscriptions/:id (Hulu → Hulu Plus, $9.99 quarterly, canceled) | 200, `annual_cents: 3996`, audit row `active → canceled +3996`, savings += $39.96 | all as expected |
| PUT without `status` | keeps existing status | kept `canceled` |
| PUT / DELETE id 999999 | 404 | 404 |
| DELETE /api/subscriptions/:id | 200, savings drop by $39.96, audit rows removed (ON DELETE CASCADE) | 200, savings back to $143.88, 0 rows left |
| DELETE same id again | 404 | 404 |
| GET /api/categories | 8 categories | 8 categories in seed order |
| GET /api/subscriptions?category_id=1 | Netflix, Spotify | Netflix, Spotify |
| GET /api/does-not-exist | 404 JSON | `{"error":"API route not found."}` |
| GET / | 200 dashboard from public/ | 200 |

**Result: PASS.**

## 6. Persistence

**Input:** With Spotify canceled, stop the server with Ctrl+C, run `npm start`
again (no seed), reload the dashboard.

| Metric | Before restart | After restart |
|---|---|---|
| Reclaimed Annual Savings | $143.88 | $143.88 |
| Active Subscriptions | 3 / 5 | 3 / 5 |
| Audit log rows | 3 | 3 |

**Result: PASS.** Screenshot: `07_persistence_after_restart.png`

## 7. Safe display of names (instructor feedback, Nov 22)

**Input:** POST a subscription named `<img src=x onerror=alert(1)>`, reload.

| | Before fix | After fix |
|---|---|---|
| Table cell | blank name, `<img>` element injected, `alert(1)` fired | literal text `<img src=x onerror=alert(1)>`, no script runs |

**Fix:** `public/app.js` now escapes user-supplied text (`escapeHtml`) before
it is placed in the table rows, the category chips, the breakdown list and the
audit log. Screenshot: `08_xss_rendered_as_text_after_fix.png`

**Result: FAIL on `337ac45`, PASS after the fix.**

## Known limitations

- No authentication: the app is single-user by design (proposal scope).
- `GET /api/subscriptions?category_id=abc` returns an empty list instead of 400.
- The audit log panel shows the 10 most recent transitions only.
