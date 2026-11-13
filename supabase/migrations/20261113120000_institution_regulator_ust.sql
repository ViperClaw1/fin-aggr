-- Treasury is an issuer, not an FDIC or NCUA insurer (ADR-020).
-- insurance_limits stays FDIC | NCUA. No UST limit is invented.

alter table institutions drop constraint institutions_regulator_check;

alter table institutions
  add constraint institutions_regulator_check
  check (regulator in ('FDIC', 'NCUA', 'UST'));
