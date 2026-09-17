# Material Claims Requisition Flow Final Spec

Date: 2026-03-17
Status: Final working handover from business discussion
Scope: Production Planning > Material Claims > QA Claim Grouping > Warehouse Requisition Excel Export

## Purpose

This document defines the agreed end-to-end flow for:

- how material ownership is derived
- how QA users see and claim material rows
- how grouped requisition drafts are created and confirmed
- how warehouse exports one Excel file containing many requisition documents
- when same-material rows may be merged
- when same-material rows must stay separate
- how to prevent duplicate export and numbering mistakes

This document is intended to be detailed enough that the next person can continue implementation without re-opening the same business questions.

## Business Summary

The process has two different working roles:

- QA-side users review, claim, group, and confirm material rows
- Warehouse users export confirmed requisition groups into one final Excel file

The system must be flexible:

- QA does not need to finish every row in the whole week before warehouse can export
- warehouse may export only the groups that are already confirmed and ready

But the system must also be safe:

- unclaimed rows must never be exported
- the same source row must never be exported twice
- document numbers must continue from the last exported document
- grouping rules must respect QA ownership unless the acting user has cross-QA consolidation authority

## Current Product Context

Relevant product areas:

- `src/app/production-line/planning/claims/page.js`
- `src/features/production-planning/components/MaterialClaimsWorkspaceClientRecovered.js`
- `src/app/api/production-planning/requisition/export/route.js`
- `src/lib/claimPermissions.js`
- `src/lib/materialClaimPool.js`

Existing business context already confirmed:

- planning page and claims page are separate
- claims page is the working area before requisition export
- there is already a page that maps product responsibility to username
- that product-to-username mapping is the base source of QA ownership

## Core Design Principle

The most important design rule is:

`material identity alone is not enough to decide merge behavior`

The same raw material may appear in many FG/BOM combinations. Those FG items may belong to different QA owners. Therefore:

- same material may sometimes be merged
- same material may sometimes need to remain separate

The deciding factor is not BOM by itself.

The deciding factor is:

- who owns the source FG/product according to product-user mapping
- who is the acting user
- whether the acting user has cross-QA consolidation authority

## Ownership Source of Truth

### 1. Product-to-username mapping is the base ownership model

The existing product assignment screen already defines which user is responsible for which product.

Therefore the system should derive row ownership as follows:

1. a material requirement row originates from one FG/product and BOM path
2. the FG/product is mapped to a username
3. that mapped username becomes the QA owner of that row

Important consequence:

- the same material code can belong to different QA owners in different rows
- ownership must not be inferred only from the material code

### 2. BOM is traceability, not the primary merge boundary

The same material may be used in BOMs of many FG products.

If those FG products belong to the same QA owner:

- rows may be merged for requisition purposes

If those FG products belong to different QA owners:

- rows must stay separate unless the acting user has cross-QA consolidation authority

Therefore:

- BOM/FG must still be stored for traceability and audit
- BOM/FG does not automatically force separation if the QA owner is the same

## Roles

### 3. QA normal user

Normal QA user behavior:

- sees only material rows derived from products assigned to that user
- can claim only rows in that owned scope
- can create requisition draft groups only within that owned scope
- cannot consolidate same-material rows across another QA owner

### 4. QA multi-scope or supervisor user

Some users may be allowed to work across multiple QA scopes or all QA scopes.

These users may:

- see material rows across many QA owners
- claim or review rows across those scopes if business allows
- consolidate same-material rows across multiple QA owners if they have the specific authority

This must not be guessed from visibility alone.

The system should explicitly distinguish:

- user can view many QA scopes
- user can consolidate across many QA scopes

### 5. Warehouse user

Warehouse is the exporting role.

Warehouse should:

- see requisition groups that QA has already confirmed
- export one Excel file from selected ready groups
- not export unclaimed rows
- not export draft or incomplete groups

Warehouse does not need QA to complete every pending row in the system.
Warehouse only needs the selected requisition groups to be valid and ready.

## Permission Model

### 6. Minimum permission concepts

To support the business rules clearly, the system should recognize at least these concepts:

- `owned products`
- `derived QA-owned material rows`
- `can_view_cross_qa`
- `can_consolidate_cross_qa`

Recommended interpretation:

- `owned products` comes from the existing product-to-username mapping page
- `can_view_cross_qa` is optional if visibility already comes from role/delegation
- `can_consolidate_cross_qa` is the important extra authority for merging same-material rows across different QA owners

### 7. Why view permission and consolidation permission must be separate

A user may be able to see many QA scopes for monitoring or management, but still should not necessarily be allowed to merge them into one requisition line or one requisition document.

Therefore:

- `can view` is not automatically the same as `can consolidate`
- merge behavior must check consolidation authority, not just visibility

## Material Merge Rules

### 8. When same-material rows may be merged

Rows may be merged into one requisition line when all of the following are true:

- `material_goods_code` is the same
- row status is eligible for grouping/export
- the acting user is allowed to work on all involved rows
- one of these ownership conditions is true:
  - all rows belong to the same QA owner
  - or the acting user has `can_consolidate_cross_qa = true`

### 9. When same-material rows must stay separate

Rows must remain separate when any of the following is true:

- material code is different
- one or more rows are still unclaimed
- rows belong to different QA owners and the acting user does not have cross-QA consolidation authority
- one or more rows already belong to another requisition group
- one or more rows were already exported

### 10. Important clarification about BOM and FG

The same material may be linked to many BOMs and many FG products.

This alone does not force separation.

If all those FG products belong to the same QA owner:

- merge is allowed

If some FG products belong to QA1 and others belong to QA2:

- merge is not allowed for a normal QA user
- merge is allowed only for a user with cross-QA consolidation authority

## Working Objects in the Flow

### 11. Source material row

A source row is the lowest traceable unit used for claim and export preparation.

Minimum logical fields:

- `id`
- `master_plan_no`
- `bucket_date`
- `fg_sku_code`
- `fg_goods_code` if available
- `bom_id` or equivalent trace key if available
- `material_sku_code`
- `material_goods_code`
- `required_qty`
- `issue_qty`
- `owner_username`
- `owner_scope_key` or equivalent QA-owner key
- `claimed_by`
- `claimed_at`
- `status`
- `requisition_group_id` nullable
- `export_batch_id` nullable
- `exported_document_no` nullable

### 12. Requisition group

A requisition group is a draft or confirmed logical requisition document before warehouse export.

One requisition group will eventually receive one document number.

Minimum logical fields:

- `id`
- `group_name` or temporary label
- `status`
- `created_by`
- `confirmed_by`
- `created_at`
- `confirmed_at`
- `can_cross_qa` or derived from creator authority
- `export_batch_id` nullable
- `document_no` nullable until final export

### 13. Export batch

An export batch is one warehouse export action that produces one Excel file.

One export batch may contain many requisition groups.

Minimum logical fields:

- `id`
- `exported_by`
- `exported_at`
- `file_name`
- `group_count`
- `row_count`

## Status Model

### 14. Row-level status

Recommended row-level states:

- `pending_claim`
- `claimed`
- `grouped`
- `qa_confirmed`
- `exported`

Practical meaning:

- `pending_claim`: not ready for grouping or export
- `claimed`: QA has taken responsibility for the row
- `grouped`: assigned into a requisition group draft
- `qa_confirmed`: the requisition group is final on QA side and ready for warehouse export
- `exported`: already included in a final Excel export

### 15. Group-level status

Recommended group-level states:

- `draft`
- `ready_to_export`
- `exported`
- `cancelled` if needed

Practical meaning:

- `draft`: still being assembled or edited by QA
- `ready_to_export`: QA confirmed and warehouse may export it
- `exported`: final document number assigned and already sent out in an Excel file

## End-to-End User Flow

### 16. QA-side preparation flow

1. QA opens the material claims page.
2. System loads only rows the acting user is allowed to work on.
3. Rows are derived from product ownership mapping.
4. QA reviews pending rows.
5. QA claims rows they are responsible for.
6. QA selects claimed rows and creates a requisition group draft.
7. QA may continue adding or editing rows inside the draft group if business allows.
8. QA confirms the requisition group.
9. Confirmed group status becomes `ready_to_export`.
10. Warehouse can now see this group as exportable.

### 17. Warehouse export flow

1. Warehouse opens the requisition export workspace or export list.
2. System shows only groups with status `ready_to_export`.
3. Warehouse selects one or more ready groups.
4. Backend validates every selected group and every row again.
5. Backend generates document numbers group-by-group.
6. Backend creates one Excel file containing rows from all selected groups.
7. Backend marks groups and rows as `exported`.
8. Backend stores export batch metadata and file output trace.

### 18. Flexible weekly behavior

The system must support partial readiness.

That means:

- if QA1 has 3 groups ready
- QA2 has 2 groups ready
- QA3 still has pending rows

Warehouse may export the 5 ready groups immediately.
QA3 unfinished rows remain pending for a later batch.

The system must not require all QA rows in the whole week to be finished before export.

## Grouping Rules

### 19. Grouping rule for normal QA user

A normal QA user may create a requisition group from:

- claimed rows
- belonging to the same material code
- belonging to the same QA owner scope

If same-material rows belong to another QA owner:

- they must not be merged into the same requisition line or the same cross-owner grouped result

### 20. Grouping rule for cross-QA consolidator

A user with cross-QA consolidation authority may:

- select same-material rows from multiple QA owners
- group them into the same requisition group
- merge them into the same requisition export line if business wants one combined line

Even in this case, the system must retain the source breakdown internally:

- which quantity came from QA1
- which quantity came from QA2
- which quantity came from QA3

### 21. UI display rule versus export rule

The system may show:

- a combined material summary for convenience
- and a detailed breakdown by QA owner

But export behavior must always follow the permission and grouping rules above.

Do not assume that because the UI shows one combined summary, the export line can always be combined.

## Confirmation Rules

### 22. QA confirmation is the readiness checkpoint

Warehouse export should use QA confirmation as the final readiness signal.

A group may be exported only when:

- all included rows are claimed
- all included rows are valid for that group
- QA has confirmed the group
- group status is `ready_to_export`

### 23. Export should not wait for the whole system

The chosen business model is flexible, not all-or-nothing.

Therefore:

- warehouse must not be blocked by unrelated rows that are still pending elsewhere
- export should include only the ready groups selected for that batch

### 24. Export should never include incomplete rows

Even in the flexible model:

- unclaimed rows must never be exported
- draft groups must never be exported
- partially invalid groups must fail validation and stay unexported

## Duplicate Prevention and Safety Rules

### 25. One source row may belong to only one active group

A single source row must not be assigned to multiple draft or ready requisition groups at the same time.

Recommended enforcement:

- one active `requisition_group_id` per source row
- move operation must remove the row from the previous group before adding it to the next

### 26. Exported rows are permanently locked from re-export

Once a row is exported:

- it must be marked `exported`
- it must store `export_batch_id`
- it must store `document_no`
- it must no longer be selectable into a new requisition group

### 27. Backend validation is mandatory

Do not rely on frontend validation only.

Before final export, backend must validate that:

- every selected group exists
- every selected group is `ready_to_export`
- every row in each selected group is still claimed
- every row is still assigned to the correct group
- no row is already exported
- merge behavior does not violate permission rules

If any validation fails:

- the whole export batch should fail
- no document numbers should be consumed if transaction design allows

### 28. Concurrency protection

The export action must be protected against double-click, two tabs, or two users exporting the same groups at the same time.

Recommended approach:

- use a database transaction for final export finalization
- lock the selected groups and rows during numbering and status update
- assign document numbers only inside that protected finalization step

## Document Number Rules

### 29. Document format

Requested format:

- `XA{YY}{MM}/{NNNN}`

Example:

- `XA6903/0001`

Current working interpretation:

- `XA` fixed prefix
- `YY` likely Buddhist Era year, 2 digits
- `MM` current month, 2 digits
- `NNNN` running sequence, 4 digits

### 30. Document date versus document number year

Document date in Excel should use Gregorian year:

- `DD/MM/YYYY`

Document number may still use Buddhist Era 2-digit year if business keeps the current example.

This ambiguity is preserved from the earlier agreement and should remain explicit until business confirms it permanently.

### 31. Number sequence behavior

Document numbers must continue from the last exported requisition document.

Important rule:

- sequence belongs to requisition documents
- sequence does not belong to Excel files
- sequence does not restart just because warehouse exports a new file

Example:

- yesterday last exported document = `XA6903/0010`
- today warehouse exports 3 ready groups in one file
- document numbers must become:
  - `XA6903/0011`
  - `XA6903/0012`
  - `XA6903/0013`

### 32. Number generation timing

Document numbers must not be generated when QA creates or edits draft groups.

Document numbers should be generated only when warehouse performs final export.

Reason:

- prevents wasted or orphaned numbers
- reduces confusion from deleted or changed draft groups
- ensures numbers are reserved only for truly exported documents

## Excel Export Behavior

### 33. One export action produces one Excel file

The final result of one warehouse export action is:

- one Excel file only

That file may contain:

- one or more requisition groups
- therefore one or more document numbers

ERP separates those documents by the `เลขที่เอกสาร` column.

### 34. One group equals one document number

Each requisition group gets exactly one document number during final export.

Therefore:

- all rows in the same group share the same document number
- different groups receive different document numbers

### 35. Export selection rule

Warehouse may choose any set of `ready_to_export` groups for one batch, such as:

- 2 groups
- 5 groups
- 10 groups

All selected groups become one Excel file, but keep separate document numbers.

## Excel Column Mapping

### 36. Required export columns

The export file should contain these columns and values:

| Column | Value rule |
| --- | --- |
| วันที่เอกสาร | Current date in `DD/MM/YYYY` Gregorian year |
| เลขที่เอกสาร | Generated per requisition group during final export |
| รหัสสาขา | `00000` |
| รหัสแผนก | Department code according to the export logic used by business |
| รหัสโครงการ | `0` |
| เบิกไปสำหรับ | `เบิกเพื่อการผลิต` |
| ราคาที่แสดง | `-1` |
| หมายเหตุ | blank |
| รหัสซื้อขาย | material goods/trade code |
| จำนวน | final issue quantity |
| ราคาต่อหน่วย | blank |
| น้ำหนักต่อหน่วย | blank |
| เลขล็อต | blank |
| เลขกำกับ | blank |
| ตำแหน่งเก็บ | `1` |

Important notes:

- `รหัสซื้อขาย` must use the goods/trade code, not only internal SKU if they differ
- `จำนวน` must use the final requisition issue quantity
- if same-material rows are merged by allowed business rules, the exported quantity should be the summed quantity of those rows

## Recommended UI Behavior

### 37. QA claims workspace

Recommended UI elements:

- filters for date, product, material, owner, status
- combined material summary view
- expandable owner-level detail view
- checkbox selection for claimable rows
- action to create requisition group from selected claimed rows
- draft group list
- confirm group action

### 38. Combined view and detailed view

When same material appears across many source rows, the UI should support:

- combined summary view for convenience
- breakdown view by QA owner
- optional deeper trace to FG/BOM row if needed

This helps the user work quickly without losing traceability.

### 39. Warehouse export workspace

Recommended UI elements:

- list of groups with status `ready_to_export`
- group owner summary
- material count and total quantity summary
- export checkbox per group
- final export button
- warning if another export is already in progress

## Recommended Data and Audit Requirements

### 40. Keep source trace even after merge

Even when export merges same-material rows:

- the system must preserve which source rows contributed to that merged export line
- this should remain queryable after export

This is important for:

- troubleshooting
- stock issue investigation
- user accountability
- future reprint or audit

### 41. Store export metadata

For every exported group and row, store at least:

- `export_batch_id`
- `document_no`
- `exported_by`
- `exported_at`

Optional but helpful:

- `source_group_id`
- `line_merge_key`
- `merged_source_row_count`

## Decision Table

### 42. Merge and export decision matrix

| Situation | Can normal QA merge? | Can cross-QA consolidator merge? | Can export? |
| --- | --- | --- | --- |
| Same material, same QA owner, claimed, ready | Yes | Yes | Yes |
| Same material, different QA owner, no cross-QA authority | No | N/A | Only as separate lines/groups |
| Same material, different QA owner, user has cross-QA authority | No for normal QA | Yes | Yes, if group is confirmed |
| Same material, same QA owner, but row not claimed | No | No | No |
| Row already exported | No | No | No |
| Group still draft | N/A | N/A | No |

## Non-Negotiable Rules

### 43. Rules that must not be broken

- unclaimed rows must never be exported
- draft groups must never be exported
- one source row must not exist in multiple active groups
- one exported row must not be exported again
- document numbers must be sequential across exported requisition documents
- document numbers must be generated only at final export
- same-material rows from different QA owners must stay separate unless the acting user has cross-QA consolidation authority
- product-to-username mapping is the base source of QA ownership

## Open Questions Still Allowed

### 44. Remaining confirm-later items

The following items may still need final confirmation later, but they do not change the main flow:

- whether document number year definitely uses Buddhist Era 2-digit year
- whether running number resets monthly by prefix
- what exact department code should be written when a cross-QA consolidated export line is produced
- whether destination note or dispatch note should be captured per requisition group

## Recommended Implementation Order

### 45. Suggested build sequence

1. Derive owner from product-to-username mapping on each material row.
2. Add row status and requisition group concepts.
3. Add QA draft-group and confirmation flow.
4. Add warehouse ready-group export list.
5. Add backend validation and duplicate prevention.
6. Add final export batch generation with transactional document numbering.
7. Add combined view and owner-breakdown UI refinements.

## Final Short Summary

This is the agreed operating model:

- ownership starts from product-to-username mapping
- same material may come from many FG/BOM rows
- if those rows belong to the same QA owner, they may be merged
- if those rows belong to different QA owners, they must stay separate unless the acting user has cross-QA consolidation authority
- QA prepares and confirms requisition groups
- warehouse exports only confirmed groups
- one warehouse export action produces one Excel file
- one requisition group becomes one document number
- document numbers continue sequentially from the last exported document
