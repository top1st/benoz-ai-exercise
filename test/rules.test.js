"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateRules, resolveOperand } = require("../lib/rules");

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
