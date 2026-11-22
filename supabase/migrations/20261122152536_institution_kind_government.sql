-- The U.S. Treasury issues bills and notes: it is not a bank, a credit union or a fintech
-- partner, and its securities are not insured deposits (ADR-020, Treasury products).

alter table institutions drop constraint institutions_kind_check;

alter table institutions
  add constraint institutions_kind_check
  check (kind in ('direct_bank', 'credit_union', 'fintech_partner', 'government'));
