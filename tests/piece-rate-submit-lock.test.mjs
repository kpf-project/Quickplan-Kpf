import assert from "node:assert/strict";
import test from "node:test";

import { createSubmitLock } from "../src/lib/submitLock.js";

test("createSubmitLock blocks repeated starts until released", () => {
  const lock = createSubmitLock();

  assert.equal(lock.tryStart(), true);
  assert.equal(lock.tryStart(), false);

  lock.release();

  assert.equal(lock.tryStart(), true);
});
