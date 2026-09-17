import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeWorkCenterInput,
  normalizeWorkCenterQuery,
} from "../src/lib/productionWorkCenters.js";

test("normalizeWorkCenterInput prepares a valid work center payload", () => {
  const result = normalizeWorkCenterInput({
    departmentId: " dept-1 ",
    code: " mix-01 ",
    name: " ห้องตีแป้ง ",
    description: "  ",
    sortOrder: "2",
    isActive: false,
    consolidateRequisitionPreviewByDate: true,
  });

  assert.deepEqual(result, {
    departmentId: "dept-1",
    deliveryPointId: null,
    code: "MIX-01",
    name: "ห้องตีแป้ง",
    description: null,
    sortOrder: 2,
    isActive: false,
    consolidateRequisitionPreviewByDate: true,
    errors: [],
  });
});

test("normalizeWorkCenterInput reports required fields and clamps sort order", () => {
  const result = normalizeWorkCenterInput({
    departmentId: "",
    code: "",
    name: "",
    sortOrder: "-5",
  });

  assert.equal(result.sortOrder, 0);
  assert.deepEqual(result.errors, [
    "departmentId is required",
    "code is required",
    "name is required",
  ]);
});

test("normalizeWorkCenterQuery keeps filters small and predictable", () => {
  const result = normalizeWorkCenterQuery({
    search: "  mix  ",
    departmentId: " dep-1 ",
    includeInactive: "true",
  });

  assert.deepEqual(result, {
    search: "mix",
    departmentId: "dep-1",
    includeInactive: true,
  });
});
