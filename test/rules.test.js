"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateRules, resolveOperand, compare } = require("../lib/rules");

const definition = {
  fields: [
    { name: "start", label: "Start", type: "date", required: true },
    { name: "end", label: "End", type: "date", required: true },
    { name: "count", label: "Count", type: "number", required: false },
    { name: "flag", label: "Flag", type: "boolean", required: false },
  ],
};

test("literal number resolves as present", () => {
  const result = resolveOperand({ value: 5 }, {}, definition);
  assert.deepEqual(result, { ok: true, present: true, value: 5 });
});

test("literal zero is present", () => {
  const result = resolveOperand({ value: 0 }, {}, definition);
  assert.deepEqual(result, { ok: true, present: true, value: 0 });
});

test("literal false is present", () => {
  const result = resolveOperand({ value: false }, {}, definition);
  assert.deepEqual(result, { ok: true, present: true, value: false });
});

test("literal string resolves as present", () => {
  const result = resolveOperand({ value: "2027-01-15" }, {}, definition);
  assert.deepEqual(result, { ok: true, present: true, value: "2027-01-15" });
});

test("field present in the record resolves to its value", () => {
  const result = resolveOperand({ field: "start" }, { start: "2027-01-15" }, definition);
  assert.deepEqual(result, { ok: true, present: true, value: "2027-01-15" });
});

test("field present as empty string is not present", () => {
  const result = resolveOperand({ field: "start" }, { start: "" }, definition);
  assert.deepEqual(result, { ok: true, present: false, value: undefined });
});

test("field absent from the record is not present", () => {
  const result = resolveOperand({ field: "start" }, {}, definition);
  assert.deepEqual(result, { ok: true, present: false, value: undefined });
});

test("field null is not present", () => {
  const result = resolveOperand({ field: "count" }, { count: null }, definition);
  assert.deepEqual(result, { ok: true, present: false, value: undefined });
});

test("bare string operand is invalid", () => {
  const result = resolveOperand("start", { start: "2027-01-15" }, definition);
  assert.deepEqual(result, { ok: false, error: "invalid_operand" });
});

test("object with neither field nor value is invalid", () => {
  const result = resolveOperand({ foo: 1 }, {}, definition);
  assert.deepEqual(result, { ok: false, error: "invalid_operand" });
});

test("operand naming a field not in the definition is unknown_field", () => {
  const result = resolveOperand({ field: "nope" }, { nope: "x" }, definition);
  assert.deepEqual(result, { ok: false, error: "unknown_field" });
});

test("evaluateRules is still a stub", () => {
  const result = evaluateRules(definition, { start: "2027-01-15" }, []);
  assert.deepEqual(result, []);
});

test("eq is true for equal numbers and false otherwise", () => {
  assert.deepEqual(compare(5, "eq", 5), { ok: true, matched: true });
  assert.deepEqual(compare(5, "eq", 6), { ok: true, matched: false });
});

test("neq is true for unequal numbers and false otherwise", () => {
  assert.deepEqual(compare(5, "neq", 6), { ok: true, matched: true });
  assert.deepEqual(compare(5, "neq", 5), { ok: true, matched: false });
});

test("gt is true when left is greater", () => {
  assert.deepEqual(compare(10, "gt", 9), { ok: true, matched: true });
  assert.deepEqual(compare(9, "gt", 10), { ok: true, matched: false });
});

test("lt is true when left is lesser", () => {
  assert.deepEqual(compare(9, "lt", 10), { ok: true, matched: true });
  assert.deepEqual(compare(10, "lt", 9), { ok: true, matched: false });
});

test("gte and lte are true when values are equal", () => {
  assert.deepEqual(compare(10, "gte", 10), { ok: true, matched: true });
  assert.deepEqual(compare(10, "lte", 10), { ok: true, matched: true });
  assert.deepEqual(compare(9, "gte", 10), { ok: true, matched: false });
  assert.deepEqual(compare(10, "lte", 9), { ok: true, matched: false });
});

test("dates compare lexicographically across a year boundary", () => {
  assert.deepEqual(compare("2026-12-31", "lt", "2027-01-01"), { ok: true, matched: true });
  assert.deepEqual(compare("2027-01-01", "gt", "2026-12-31"), { ok: true, matched: true });
  assert.deepEqual(compare("2026-12-31", "gte", "2027-01-01"), { ok: true, matched: false });
});

test("number vs string is type_mismatch, not coerced", () => {
  assert.deepEqual(compare("10", "gt", 9), { ok: false, error: "type_mismatch" });
});

test("boolean ordering operators are type_mismatch", () => {
  assert.deepEqual(compare(true, "gt", false), { ok: false, error: "type_mismatch" });
});

test("booleans support eq and neq", () => {
  assert.deepEqual(compare(true, "eq", true), { ok: true, matched: true });
  assert.deepEqual(compare(true, "neq", false), { ok: true, matched: true });
});

test("unknown operator is unknown_op", () => {
  assert.deepEqual(compare(1, "foo", 2), { ok: false, error: "unknown_op" });
});
