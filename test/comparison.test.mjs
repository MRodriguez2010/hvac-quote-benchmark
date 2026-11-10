import test from "node:test";
import assert from "node:assert/strict";
import { examples, evaluate } from "../example.mjs";
test("exact equipment and comparable scope allow a price comparison", () => {
  assert.equal(evaluate(examples[0]).verdict, "high");
});
test("additional field work blocks an otherwise exact comparison", () => {
  const result = evaluate(examples[1]);
  assert.equal(result.match, "exact");
  assert.equal(result.verdict, "unclear");
  assert.ok(result.reasons.length);
});
test("a same-system proxy supplies a planning reference only", () => {
  const result = evaluate(examples[2]);
  assert.equal(result.match, "same_system_proxy");
  assert.equal(result.verdict, "unclear");
});
