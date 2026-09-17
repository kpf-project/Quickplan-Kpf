import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPhotoAssignments,
  extractPhotoCode,
  normalizeComparableEmployeeCode,
  selectPreferredPhoto,
} from "../scripts/import-employee-photos.mjs";

test("extractPhotoCode reads numeric and KPF-prefixed filenames", () => {
  assert.equal(extractPhotoCode("02190 KO KO LIN HTET.png"), "02190");
  assert.equal(extractPhotoCode("KPF-02175 KYAW SEIN.png"), "02175");
  assert.equal(extractPhotoCode("employee without code.jpg"), "");
});

test("normalizeComparableEmployeeCode matches raw and KPF-prefixed codes", () => {
  assert.equal(normalizeComparableEmployeeCode("02190"), "02190");
  assert.equal(normalizeComparableEmployeeCode(" kpf-02190 "), "02190");
  assert.equal(normalizeComparableEmployeeCode("KPF 02190"), "02190");
});

test("selectPreferredPhoto favors KPF-prefixed names, then PNG", () => {
  assert.equal(
    selectPreferredPhoto([
      "02175 KYAW SEIN.jpg",
      "02175 KYAW SEIN.png",
      "KPF-02175 KYAW SEIN.png",
    ]),
    "KPF-02175 KYAW SEIN.png"
  );
  assert.equal(
    selectPreferredPhoto(["00592 MAY YATI TUN.jpg", "00592 MAY YATI TUN.png"]),
    "00592 MAY YATI TUN.png"
  );
});

test("buildPhotoAssignments assigns one photo to raw and KPF employee records", () => {
  const employees = [
    { PRS_NO: "02190", EMP_INTL: "1001" },
    { PRS_NO: "KPF-02190", EMP_INTL: "1002" },
    { PRS_NO: "KPF-99999", EMP_INTL: "1003" },
  ];
  const photos = [{ code: "02190", filePath: "public/EMP-Photo/02190 Person.png" }];

  assert.deepEqual(buildPhotoAssignments(employees, photos), [
    { employeeCode: "02190", photoCode: "02190", filePath: "public/EMP-Photo/02190 Person.png" },
    { employeeCode: "KPF-02190", photoCode: "02190", filePath: "public/EMP-Photo/02190 Person.png" },
  ]);
});
