-- Deposits from the FDIC financials feed, in thousands of USD (ADR-020, 2026-11-12).
-- Null is a row written before this column. A published call report sets it.

alter table bank_metrics
  add column if not exists deposits_usd_thousands bigint
  check (deposits_usd_thousands is null or deposits_usd_thousands >= 0);
