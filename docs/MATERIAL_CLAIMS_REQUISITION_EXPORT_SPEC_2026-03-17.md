# Material Claims and Requisition Export Spec

Date: 2026-03-17
Status: Working agreement from discussion with business/user
Scope: Production Planning > Material Claims > Requisition Excel Export

## Purpose

This document captures the agreed behavior for:

- Material claim visibility and permissions
- Preconditions before requisition export
- How requisition documents should be grouped
- How Excel export rows should be shaped
- How document numbers should work
- How future multi-department QA use cases should behave

This is a handover/spec document so the next person can continue implementation with the same understanding.

## Current Product Context

- `บันทึกแผนการผลิต` and `เคลมวัตถุดิบ` are separate routes/pages.
- `เคลมวัตถุดิบ` is the workspace where users claim materials and then export requisition data.
- There is also a separate `ใบเบิกวัตถุดิบ` menu/page, but the export action discussed here originates from the claims workflow.

Relevant code references:

- `src/app/production-line/planning/claims/page.js`
- `src/features/production-planning/components/MaterialClaimsWorkspaceClientRecovered.js`
- `src/app/api/production-planning/requisition/export/route.js`
- `src/lib/claimPermissions.js`
- `src/lib/materialClaimPool.js`

## Agreed Core Rules

### 1. Export precondition

Before the system can export the requisition as a real Excel file:

- All material rows that will be included in export must be claimed first.
- Export must not proceed for rows that are still unclaimed.
- The export output is claim-based.

Business meaning:

- `ยังไม่เคลม` = not ready for requisition export
- `เคลมแล้ว` = eligible for requisition export

## Department Scope and User Visibility

### 2. Department visibility is tied to the logged-in user

Current system understanding:

- A normal user sees only the departments they are assigned to.
- Some users may have broader scope via role/delegation.
- Department scope already exists in the current claims flow.

Expected behavior:

- A regular QA user should see only the material rows for the QA department(s) they are allowed to work on.
- If a supervisor or delegated user is allowed to manage multiple QA departments, they may see multiple QA departments.
- Even when a user sees multiple departments, the system must still preserve per-department separation.

Important business rule:

- The system must support both:
  - a per-department view
  - a combined/all-visible-departments view

But even in the combined view:

- each row must still retain its own department identity
- quantity and requisition grouping must still be attributable to the correct department

## Future QA Multi-Department Scenario

### 3. Multi-QA visibility requirement

Future business scenario:

- There may be many QA departments.
- Two subordinate users may be allowed to see materials for all QA departments.
- They must be able to see:
  - the breakdown by each QA department
  - the overall combined total

Required behavior:

- A user with multi-department rights can switch/filter by department.
- The UI should also offer an "all departments I manage" mode.
- The combined mode is for monitoring and working convenience only.
- Requisition grouping/export must still remain department-safe and traceable.

Recommended UI behavior:

- Filter: `Department`
- Options:
  - one specific department
  - all departments in my scope
- Views:
  - `แยกรายแผนก`
  - `รวมทั้งหมด`

## Requisition Export File Behavior

### 4. Export output is one Excel file

The final export should be:

- one Excel file only

However, within that single file:

- there may be multiple requisition documents
- ERP will separate documents using the `เลขที่เอกสาร` column

Meaning:

- same document number = same requisition document
- different document number = different requisition document

This is a critical rule.

## Document Grouping Rule

### 5. One department does not always mean one document number

Agreed understanding:

- Department is always the main boundary.
- A requisition must never mix rows across departments.
- But a single department may still need more than one document number.

Reason:

- Materials may be sent to different destinations/receiving points.
- Each destination may require its own printed requisition sheet to travel with the goods.

Therefore:

- `1 department` may result in `1 or more document numbers`
- The true grouping unit is:
  - department
  - plus the working group chosen for dispatch/delivery

## Recommended Grouping Design

### 6. Recommended approach: manual grouping by user before export

The recommended design is not fully automatic grouping.

Reason:

- The system cannot reliably infer the real dispatch grouping from planning data alone.
- The operational reason for splitting requisitions is based on actual destination/use on the floor.
- That decision is best confirmed by the working user.

Recommended UX:

1. User enters `เคลมวัตถุดิบ`
2. User sees claimed material rows for their department scope
3. User selects rows using checkboxes
4. User clicks `สร้างชุดใบเบิก`
5. Those selected rows become one requisition group
6. User selects another set of rows and creates another requisition group
7. After all rows are assigned to groups, user exports one Excel file
8. System generates one document number per group

Business meaning:

- Rows selected together into one group = same `เลขที่เอกสาร`
- Rows assigned to a different group = different `เลขที่เอกสาร`

### 7. Export readiness rule

Recommended enforcement:

- Export should only be allowed when all rows intended for export are both:
  - claimed
  - assigned into a requisition group

Suggested status model:

- `Unclaimed`
- `Claimed but ungrouped`
- `Grouped and ready for export`
- `Exported`

## Recommended UI Design

### 8. Claims page additions

Recommended additions to the claims page:

- Checkbox on each exportable row
- Action button: `สร้างชุดใบเบิกจากรายการที่เลือก`
- A grouped list/section: `ชุดใบเบิกที่เตรียมส่งออก`
- Count summary:
  - unclaimed rows
  - claimed but ungrouped rows
  - grouped rows
  - total groups

Recommended per-group actions:

- remove row from group
- move row to another group
- merge groups
- delete group

Export button behavior:

- disabled if there are still relevant rows not claimed
- disabled if claimed rows remain ungrouped
- enabled only when requisition groups are valid

## Excel Column Mapping

### 9. Required export columns

The user requested these Excel columns and values:

| Column | Value rule |
| --- | --- |
| วันที่เอกสาร | Current date, format `DD/MM/YYYY`, Gregorian year (ค.ศ.) |
| เลขที่เอกสาร | Generated document number per requisition group |
| รหัสสาขา | `00000` |
| รหัสแผนก | Department code from selected/active department, e.g. `KP13` |
| รหัสโครงการ | `0` |
| เบิกไปสำหรับ | `เบิกเพื่อการผลิต` |
| ราคาที่แสดง | `-1` |
| หมายเหตุ | blank |
| รหัสซื้อขาย | goods/trade code of the material item |
| จำนวน | issue quantity / quantity to requisition |
| ราคาต่อหน่วย | blank |
| น้ำหนักต่อหน่วย | blank |
| เลขล็อต | blank |
| เลขกำกับ | blank |
| ตำแหน่งเก็บ | `1` |

Important note:

- `รหัสซื้อขาย` must come from the trade/goods code, not just the internal SKU if those differ.
- `จำนวน` must come from the final issue quantity used for requisition.

## Document Number Spec

### 10. Document number format

Requested format:

- `XA{YY}{MM}/{NNNN}`

Example:

- `XA6903/0001`

Agreed interpretation:

- Prefix starts with `XA`
- `{MM}` is the current month, auto-generated
- `{NNNN}` is the running number for the document sequence
- Running number increments only when a new requisition group/document is created

### 11. Important year rule clarification

There is an ambiguity that must be explicitly preserved in this spec:

- `วันที่เอกสาร` must use Gregorian year / ค.ศ.
- But the example `XA6903/0001` implies the document number year is likely using Thai Buddhist year, two digits

Example:

- If current date is March 2026:
  - document date = `17/03/2026`
  - document prefix example from the business discussion = `XA6903/`

This suggests:

- document date uses `2026`
- document number year uses Buddhist Era two-digit year `69`

Working interpretation for implementation unless business changes it:

- `วันที่เอกสาร`: Gregorian `DD/MM/YYYY`
- `เลขที่เอกสาร`: `XA + Buddhist year (2 digits) + month (2 digits) + / + running(4 digits)`

### 12. Running number behavior

Running number rules:

- Running sequence is per document, not per row
- One requisition group gets one running number
- All rows inside that group share the same document number
- Next requisition group gets the next running number

Example in one Excel file:

- Group A rows -> `XA6903/0001`
- Group B rows -> `XA6903/0002`
- Group C rows -> `XA6903/0003`

### 13. Document number generation trigger

Recommended rule:

- Do not generate document numbers line-by-line
- Generate document numbers group-by-group during export finalization

That means:

- one requisition group = one generated document number
- many rows can share that number

## Recommended Data Model Extension

### 14. Requisition group concept

To support this properly, the system should introduce a requisition grouping concept before final export.

Suggested logical model:

- `requisition_export_batch`
  - one user export event
  - one Excel file
- `requisition_document_group`
  - one logical requisition document inside that file
  - one future document number
- `requisition_document_group_item`
  - material rows assigned into the group

Minimum fields for a requisition group:

- `id`
- `master_plan_no`
- `department_id`
- `group_name` or temp label
- `destination_note` or dispatch note if needed later
- `status`
- `created_by`
- `created_at`

Minimum fields for group items:

- `group_id`
- `material_sku_code`
- `material_goods_code`
- `bucket_date`
- `claim_department_id`
- `issue_qty`

## Grouping Constraints

### 15. Safety rules

Recommended hard rules:

- A group must never contain rows from different departments
- A row can belong to only one requisition group at a time
- Unclaimed rows cannot be added to a requisition group
- Export should fail if rows violate grouping rules

## Proposed User Flow

### 16. Standard user flow

1. User opens `เคลมวัตถุดิบ`
2. User selects department in their allowed scope
3. User claims all necessary material rows
4. User reviews claimed rows
5. User groups rows into one or more requisition groups
6. User confirms all claimed rows are grouped
7. User clicks export
8. System generates:
   - one Excel file
   - one document number per requisition group
9. ERP import later separates documents by `เลขที่เอกสาร`

## Design Decision Summary

### 17. Final agreed decisions so far

- Claims and planning are separate pages
- Claims page is the staging area before requisition export
- All exportable material rows must be claimed first
- Export output is one Excel file
- One Excel file can contain multiple requisition documents
- ERP distinguishes requisitions by `เลขที่เอกสาร`
- Department is always a hard boundary
- One department may still require multiple document numbers
- Multiple document numbers happen when materials must be sent to different destinations/groups
- Grouping should be user-confirmed, not guessed automatically by the system
- Recommended grouping interaction is checkbox-based selection into requisition groups
- The system should support both per-department and combined multi-department views for authorized users

## Open Items

### 18. Items still needing confirmation later

- Whether Buddhist year in document number is definitely required, or if another year convention is desired
- Whether running number resets monthly by prefix
- Whether document number should be reserved at group creation time or only at final export time
- Whether users should enter an optional destination/dispatch note per requisition group
- Whether export should include only grouped rows or always require every claimed row in scope to be grouped first

## Recommended Next Step

### 19. Suggested implementation order

1. Add requisition group concept to claims workflow
2. Prevent export until rows are claimed and grouped
3. Generate Excel from grouped rows
4. Generate document numbers per group
5. Add multi-department filter/view refinements for future QA use cases

