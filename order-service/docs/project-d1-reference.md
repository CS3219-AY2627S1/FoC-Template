# Project D1 and Approved Design References

All source paths in this file are relative to the repository root.

## Primary source

- File: `../../../Project-D1.pdf`
- Modified: 2026-09-18 13:03:42 (local workspace timestamp)
- Size: 684,124 bytes
- SHA-256: `C7381CB03CE40E64FAA1B1E9856CC99D13BF9295BA3159481C63A4AF42BFB5AC`
- Content reviewed: all 47 pages on 2026-09-23.

Project D1 is the default source for Order Service F1-F13, platform NFR1-NFR5, and NTH1-NTH5 when not superseded by an approved amendment.

## Latest approved Order Service design sources

Current workstream selection on 2026-10-08: the user explicitly selected `Order Service Overall Doc.pdf`. Its hash and D1 hash still match the table. The historical Updated PDF is absent locally, not equivalent by assumption. CHANGE-082 / ADR-025 and `sprints/sprint-2-3/README.md` record approved overrides: immutable ABORTED courier attempts with immediate current OPEN/EXPIRED, every-abort penalty/reset, expired refund, and hiding successfully reposted expired originals (F10.1.3 display override). Original PDFs/standalone diagrams were not modified. The older prohibition below is historical for Sprint 1, superseded for this approved slice.

| Document | Modified | SHA-256 | Role |
|---|---|---|---|
| `../../../Order Service Overall Doc - Updated.pdf` | 2026-10-02 00:28:11 | `EFBA1503C7D50B5A6C1214F09ECBCD1FF453004E0A6CA3F3F9F717C78831EA40` | Current updated overall FR/NTH design, sequences, class design, event contracts, amendments |
| `../../../Order Service Overall Doc.pdf` | 2026-09-23 15:59:28 | `F0E925278FCCC0FCBB48F6C7BE1C23D908E15BEF75BB7C013EEC28C3F05DA602` | Superseded overall FR/NTH design, preserved for comparison history |
| `../../../High Level Architecture Diagram - FOC.png` | 2026-09-23 16:56:17 | `F52631F9D371D34C0173A03985FE1DB0F846CE3D4659013F9F61615A05234C3A` | Platform topology and ownership |
| `../../../High Level Architecture Diagram - Order Service.png` | 2026-09-28 13:20:15 | `BB092EC12C895CC31ED1674F595FEFDAE36E20C2769FFFEF7BC1D20631ADB8B7` | Order Service internal architecture; application components invoke outbound ports and domain rules return decisions/data |
| `../../../Class Diagram - Order Service.png` | 2026-09-23 15:38:36 | `13F631FE8738CFED451E615900F931AE57426069C20927A5B3D4925400C23925` | Overall class responsibilities |
| `../../../Sprint 1/Order Service Sprint 1 Doc.pdf` | 2026-09-23 17:07:33 | `9A1FBBAB437F750464D039B43B8164B46663FE2DF6B588FF99A8E3F713C540AB` | Sprint 1 scope, sequences, contracts |
| `../../../Sprint 1/S1 Class Diagram - Order Service.png` | 2026-09-23 15:30:29 | `EA026476BE650D38D4BBBD1A00D02DC63181F520B35B843918413431D031328C` | Sprint 1 core FR classes |
| `../../../Sprint 1/S1 Class Diagram - Order Service + NTH 4.png` | 2026-09-23 17:07:45 | `4B8A1E6A6700293368D5DAEF3955EBF3C909147E44409419BC7F9A919DB25217` | Sprint 1 core plus NTH4 classes |

All PDF pages and all listed standalone diagrams were reviewed during setup. Embedded overall sequences 1-12, the embedded overall application/domain/contract class diagrams, and embedded Sprint 1 sequences 1-11/class diagrams were extracted temporarily and visually checked; no extracted copies were added to the repository.

The revised Order Service high-level architecture diagram was visually re-reviewed on 2026-09-28. Its correction clarifies internal control/data-flow direction without changing service boundaries, data ownership, external contracts, or Sprint scope.

On 2026-10-02, `Order Service Overall Doc - Updated.pdf` superseded the earlier overall design source. It adds typed completion/cancellation event publishers, a shared broker, transactional-outbox consistency, independent Credit/User subscriptions, at-least-once delivery, event deduplication/versioning, retry/dead-letter recovery, and same-order accepted cancellation handling. CHANGE-064/ADR-014 clarifies the operational split: unexpired cancellation requires a synchronous Credit hold before direct `ACCEPTED -> OPEN`; expired cancellation emits an event for refund and courier penalty. The repository comparison is in `changes/CHANGE-051-overall-design-update-comparison.md`. Standalone architecture/class diagram source artifacts remain unchanged.

## Known conflict and resolution

Project D1 F12.1-F12.1.4 describes continuous `OVERDUE` monitoring for `IN_PROGRESS` or `PICKED_UP` orders. The approved overall design and ADR-001 supersede this: evaluate `OVERDUE` once during the transition to `COMPLETED`. No continuous overdue scheduler is allowed.

Project D1 F4.1.10/F11.2.4 describe `ABORTED` to `OPEN` reopening. ADR-001 continues to defer/prohibit that transition. CHANGE-064 allows only a direct `ACCEPTED -> OPEN` transition before expiry after synchronous Credit hold confirmation. NTH4 reposting remains distinct because it creates a new linked order after expiry.

The superseded standalone class diagram showed generic `submitCourierOutcomeFlag()` and `publishCourierOutcomeFlag()` operations. The updated overall PDF originally supplied four typed event publisher pairs; CHANGE-056/ADR-011 supersede its separate completion routes with one completion event carrying overdue facts. The standalone diagram files remain source artifacts; current editable diagrams are in the Sprint 1 updated-overall directory. ADR-002's no-generic-discriminator/no-open-facts rule remains effective, while CHANGE-051/053/056 record the current event architecture and supersessions.

## Version handling

If any source timestamp or fingerprint changes, reread the complete changed document, compare it with this reference, report conflicts, and update the persistent context only after authority is established.

## CHANGE-092 source recheck — 2026-10-09

D1, Overall and Updated PDFs are now available in the local Foc directory (one directory above the checkout); all three SHA-256 fingerprints match the recorded table. Earlier absent-source statements remain dated history. No PDF modified. ADR-031 is the approved effective payload amendment: compact refund/completion, unchanged accepted snapshot.
