# Pilot Boundaries and Limitations

## Current status

SupplyLens JAK is a tested portfolio prototype. It is not a deployed Jan Aushadhi product and is not affiliated with PMBI.

## Data limitations

The repository ships with synthetic data. No real Kendra inventory or patient/customer data is included.

The prototype accepts a daily demand series. Real sales history can be censored by stockouts: zero sales do not necessarily mean zero customer demand when the medicine was unavailable. A field pilot must identify and treat those periods correctly.

`expiry_90d` is an aggregate quantity. It does not reveal exact batch expiry dates. The interface therefore fixes the expiry horizon at 90 days rather than pretending that 30-day or 60-day exposure can be inferred from unavailable data.

## Decision limitations

The following are not yet empirically validated:

- exception-score weights
- demand-shift threshold
- lead-time deterioration threshold
- forecast-confidence bands
- operational service-level policy
- any demo stocking-mandate flags

The application should therefore be used to structure a pilot conversation and parallel analysis, not to autonomously create purchase orders.

## Integration boundary

The prototype reads local CSV data only. It does not include a PMBI API or POS connector and does not claim that such developer access is currently available.

A future integration must use an authorised interface or export and should begin read-only.

## Field-validation questions

A serious pilot should establish:

1. Which inventory and transaction fields are actually available to a Kendra operator?
2. How are incoming orders, shortages and upstream unavailability represented?
3. How are expired/near-expiry batches represented?
4. Which decisions are already supported by the existing POS?
5. Which exception still requires manual interpretation?
6. What outcome can be measured without disrupting normal operations?

## Evidence standard

No percentage improvement, avoided stockout, financial saving or user-adoption claim should be made until it has been observed and documented in a real pilot.
