# Architecture and Decision Logic

## Operating principle

SupplyLens is an exception layer, not a system of record.

```text
operational data
    -> validate
    -> estimate demand
    -> calculate inventory position
    -> detect exception
    -> diagnose contributing factors
    -> prioritise
    -> recommend human review
    -> record human decision
```

The system should fail closed when required operational data is invalid. A plausible-looking number produced from invalid input is treated as a defect.

## Forecast layer

The prototype compares:

- naive forecast
- 7-period moving average
- simple exponential smoothing across several alpha values
- Croston-style intermittent-demand candidates

Candidates are compared through rolling one-step backtesting. The lowest-MAE candidate supplies the current daily forecast. WAPE is retained as a secondary diagnostic. When there is not enough history for a rolling backtest, confidence is explicitly `Insufficient` rather than inferred from an unevaluated model.

These are prototype forecasting mechanisms, not a claim that one model family is universally correct for pharmaceutical demand.

## Inventory layer

The engine derives:

- usable/available inventory
- inventory position including incoming and reserved quantities
- demand and lead-time variability
- safety stock
- reorder point
- days of cover
- target stock and calculated order quantity
- ABC/XYZ classification

Safety stock accounts for both demand variability and optional lead-time variability. Policy assumptions remain visible rather than being presented as learned facts.

## Exception layer

Potential contributing factors include:

- upstream supply unavailable
- excess or near-expiry exposure
- replenishment lead-time deterioration
- local demand increase
- local inventory position
- demo-configured stocking-mandate risk

Several factors may be present at the same time. `rootCause` is therefore the first prioritised diagnostic label, while `contributingFactors` preserves overlapping evidence.

Exception-score weights and shift thresholds are heuristics. They require calibration before field use.

## Human decision boundary

The app never interprets a recommendation as an executed order. A user can Accept or Defer an exception review. The saved decision is tied to a fingerprint of the underlying inventory state and recommendation; when that state changes, the old decision is shown as stale.

This prevents yesterday's approval from silently becoming approval of a new operational situation.

## Data boundary

CSV import rejects:

- missing required fields
- non-finite or negative inventory/cost values
- non-positive lead time
- negative or malformed demand history
- duplicate SKUs
- expiry quantity greater than on-hand inventory
- malformed optional booleans
- malformed quoted CSV
- files above the configured prototype safety limit

Imported identifiers and names are escaped before HTML rendering. Exported textual fields that could be interpreted as spreadsheet formulas are neutralised.

## Why there are two analytical representations today

The standalone engine is the canonical testable analytical module. The local-file browser prototype currently embeds a browser-compatible copy so the demonstration can open directly from `file://` without a web server or build tool.

That duplication is architectural debt. A differential parity test compares key browser outputs with the canonical engine to prevent silent calculation drift. A production build should bundle one shared analytical implementation instead.
