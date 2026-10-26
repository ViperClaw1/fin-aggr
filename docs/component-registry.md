# Component registry

Search here before creating a component. Add a row for every exported UI component.

| Component | Layer / slice | Purpose | Props (short) | Used by |
|---|---|---|---|---|
| FactValue | shared/ui | Shows a value with its provenance | `fact`, `format` | tables, cards |
| SourceCitation | shared/ui | Source, date, verification status | `provenance` | tables, cards |
| ExplainMath | shared/ui | Expandable calculation steps | `steps`, `assumptions` | result widgets |
| DataTable | shared/ui | Accessible table with caption | `caption`, `columns`, `rows` | comparison widgets |
| SponsoredSlot | app | Labeled ad slot (app layer only) | `slotId` | pages |
