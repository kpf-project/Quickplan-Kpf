import assert from "node:assert/strict";
import test from "node:test";

import {
  findPieceRateBusinessDuplicate,
  isPieceRateBusinessDuplicate,
} from "../src/lib/pieceRateDuplicateGuard.js";

test("piece-rate duplicate guard matches same work captured within the duplicate window", () => {
  const candidate = {
    employeeCode: "KPF-01271",
    productBarcode: "8859771700815",
    machineCode: "P00",
    source: "piece_rate_scan",
    inputValue: 15.295,
    metadata: {
      scaleAudit: {
        capturedAt: "2026-06-08T04:49:22.887Z",
      },
    },
  };

  const existing = {
    employee_code: "KPF-01271",
    product_barcode_snapshot: "8859771700815",
    machine_code: "P00",
    source: "piece_rate_scan",
    input_value: 15.31,
    metadata: {
      scaleAudit: {
        capturedAt: "2026-06-08T04:49:15.353Z",
      },
    },
  };

  assert.equal(isPieceRateBusinessDuplicate(candidate, existing), true);
  assert.equal(findPieceRateBusinessDuplicate(candidate, [existing]), existing);
});

test("piece-rate duplicate guard catches same work repeated after the print/offline dialog", () => {
  const candidate = {
    employeeCode: "KPF-01301",
    productBarcode: "8859771700815",
    machineCode: "P00",
    source: "piece_rate_scan",
    inputValue: 15.98,
    metadata: {
      scaleAudit: {
        capturedAt: "2026-06-27T07:00:01.694Z",
      },
    },
  };

  const existing = {
    employee_code: "KPF-01301",
    product_barcode_snapshot: "8859771700815",
    machine_code: "P00",
    source: "piece_rate_scan",
    input_value: 15.98,
    metadata: {
      scaleAudit: {
        capturedAt: "2026-06-27T06:59:52.308Z",
      },
    },
  };

  assert.equal(isPieceRateBusinessDuplicate(candidate, existing), true);
  assert.equal(findPieceRateBusinessDuplicate(candidate, [existing]), existing);
});

test("piece-rate duplicate guard ignores entries outside the capture window", () => {
  const candidate = {
    employeeCode: "KPF-01271",
    productBarcode: "8859771700815",
    machineCode: "P00",
    source: "piece_rate_scan",
    inputValue: 15.31,
    metadata: {
      scaleAudit: {
        capturedAt: "2026-06-08T05:20:03.000Z",
      },
    },
  };

  const existing = {
    employee_code: "KPF-01271",
    product_barcode_snapshot: "8859771700815",
    machine_code: "P00",
    source: "piece_rate_scan",
    input_value: 15.31,
    metadata: {
      scaleAudit: {
        capturedAt: "2026-06-08T04:48:41.353Z",
      },
    },
  };

  assert.equal(isPieceRateBusinessDuplicate(candidate, existing), false);
  assert.equal(findPieceRateBusinessDuplicate(candidate, [existing]), null);
});

test("piece-rate duplicate guard ignores a different machine or employee", () => {
  const candidate = {
    employeeCode: "KPF-01271",
    productBarcode: "8859771700815",
    machineCode: "P00",
    source: "piece_rate_scan",
    inputValue: 15.31,
    metadata: {
      scaleAudit: {
        capturedAt: "2026-06-08T04:48:41.353Z",
      },
    },
  };

  const differentMachine = {
    employee_code: "KPF-01271",
    product_barcode_snapshot: "8859771700815",
    machine_code: "P01",
    source: "piece_rate_scan",
    input_value: 15.31,
    metadata: {
      scaleAudit: {
        capturedAt: "2026-06-08T04:48:41.353Z",
      },
    },
  };

  const differentEmployee = {
    employee_code: "KPF-09999",
    product_barcode_snapshot: "8859771700815",
    machine_code: "P00",
    source: "piece_rate_scan",
    input_value: 15.31,
    metadata: {
      scaleAudit: {
        capturedAt: "2026-06-08T04:48:41.353Z",
      },
    },
  };

  assert.equal(isPieceRateBusinessDuplicate(candidate, differentMachine), false);
  assert.equal(isPieceRateBusinessDuplicate(candidate, differentEmployee), false);
});
