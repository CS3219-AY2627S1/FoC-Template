<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-6), date: 2026-09-25
Scope: Formatted domain definitions explicitly supplied by the Supplier workstream author and the project reference documents.
Author review: Reviewed and approved by @ron.
-->

# FoC Domain Language

This glossary defines shared FoC domain terms. Service specifications define behavior and implementation details separately.

## Supplier Catalogue

**Supplier**:
A physical errand origin that a requester can select for collection or pickup. A store, facility, landmark, or pickup point qualifies when an errand can originate there.
_Avoid_: Company, brand, general campus directory entry

**Supplier Identifier**:
A permanent identifier for one physical errand origin. A move to another building creates a new Supplier Identifier; correcting directions at the same physical location retains it.
_Avoid_: Brand identifier, company identifier

**Building Code**:
The canonical identifier used for a campus building. Source aliases are normalized to this code during import.
_Avoid_: Unnormalized building name

**Location Description**:
The single displayed description of a Supplier, including directions for finding it within or around its building.
_Avoid_: General description, directions field

**Supplier Category**:
A controlled label describing what an errand origin offers. A Supplier can have more than one category.
_Avoid_: Landmark type, unrestricted tag

**Hours Kind**:
The interpretation of a Supplier's typical hours: unknown, open all day, or a timed interval.
_Avoid_: Inferring all-day operation from `00:00`–`23:59`

**Duplicate Supplier**:
An ACTIVE or ARCHIVED Supplier with the same normalized name, building code, floor, and Location Description as a proposed new Supplier.
_Avoid_: Same-name Supplier at a different location
