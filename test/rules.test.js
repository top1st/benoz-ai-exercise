"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateRules, resolveOperand, compare, shouldEvaluateRule } = require("../lib/rules");
const { validateRecord } = require("../lib/validate");

const definition = {
  fields: [
    { name: "start", label: "Start", type: "date", required: true },
    { name: "end", label: "End", type: "date", required: true },
    { name: "count", label: "Count", type: "number", required: false },
    { name: "flag", label: "Flag", type: "boolean", required: false },
    { name: "until", label: "Until", type: "date", required: false },
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

test("evaluateRules with no rules key returns no errors", () => {
  const result = evaluateRules(definition, { start: "2027-01-15", end: "2027-12-15" }, []);
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

const dateOrderRule = {
  left: { field: "end" },
  op: "gte",
  right: { field: "start" },
};

test("rule runs when both field dependencies are present and valid", () => {
  const result = shouldEvaluateRule(
    dateOrderRule,
    { start: "2027-01-15", end: "2027-12-15" },
    definition,
    []
  );
  assert.deepEqual(result, { run: true });
});

test("optional field absent is missing_dependency", () => {
  const result = shouldEvaluateRule(
    { left: { field: "until" }, op: "gte", right: { field: "start" } },
    { start: "2027-01-15" },
    definition,
    []
  );
  assert.deepEqual(result, { run: false, reason: "missing_dependency" });
});

test("required field absent with a required error does not run the rule", () => {
  const result = shouldEvaluateRule(
    dateOrderRule,
    { end: "2027-12-15" },
    definition,
    [{ field: "start", message: "Start is required" }]
  );
  assert.equal(result.run, false);
});

test("field present but already failed per-field validation is invalid_dependency", () => {
  const result = shouldEvaluateRule(
    dateOrderRule,
    { start: "15/01/2027", end: "2027-12-15" },
    definition,
    [{ field: "start", message: "Start must be a date in YYYY-MM-DD format" }]
  );
  assert.deepEqual(result, { run: false, reason: "invalid_dependency" });
});

test("literal operands are not dependencies", () => {
  const result = shouldEvaluateRule(
    { left: { field: "count" }, op: "gte", right: { value: 0 } },
    { count: 3 },
    definition,
    []
  );
  assert.deepEqual(result, { run: true });
});

const wellFormedDateRule = {
  id: "end_not_before_start",
  left: { field: "end" },
  op: "gte",
  right: { field: "start" },
  target: "end",
  message: "End must not be before start",
};

test("a satisfied well-formed rule emits no errors", () => {
  const def = { ...definition, rules: [wellFormedDateRule] };
  const result = evaluateRules(
    def,
    { start: "2027-01-15", end: "2027-12-15" },
    []
  );
  assert.deepEqual(result, []);
});

test("a violated well-formed rule emits the target and message", () => {
  const def = { ...definition, rules: [wellFormedDateRule] };
  const result = evaluateRules(
    def,
    { start: "2027-12-15", end: "2027-01-15" },
    []
  );
  assert.deepEqual(result, [{ field: "end", message: "End must not be before start" }]);
});

test("a skipped missing dependency emits no rule error", () => {
  const def = { ...definition, rules: [wellFormedDateRule] };
  const result = evaluateRules(def, { end: "2027-12-15" }, []);
  assert.deepEqual(result, []);
});

test("unknown operator is a loud rule error", () => {
  const def = {
    ...definition,
    rules: [{ ...wellFormedDateRule, op: "before" }],
  };
  const result = evaluateRules(
    def,
    { start: "2027-01-15", end: "2027-12-15" },
    []
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].field, "end");
  assert.equal(result[0].message, "Rule has an unknown operator");
});

test("unknown field reference is a loud rule error", () => {
  const def = {
    ...definition,
    rules: [{ ...wellFormedDateRule, right: { field: "nope" } }],
  };
  const result = evaluateRules(
    def,
    { start: "2027-01-15", end: "2027-12-15" },
    []
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].field, "end");
  assert.match(result[0].message, /unknown field/);
});

test("missing target is a loud rule error", () => {
  const { target, ...rest } = wellFormedDateRule;
  const def = { ...definition, rules: [rest] };
  const result = evaluateRules(
    def,
    { start: "2027-01-15", end: "2027-12-15" },
    []
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].field, "end_not_before_start");
  assert.equal(result[0].message, "Rule is missing a target field");
});

test("missing message is a loud rule error", () => {
  const { message, ...rest } = wellFormedDateRule;
  const def = { ...definition, rules: [rest] };
  const result = evaluateRules(
    def,
    { start: "2027-01-15", end: "2027-12-15" },
    []
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].field, "end");
  assert.equal(result[0].message, "Rule is missing a message");
});

test("invalid operand shape is a loud rule error", () => {
  const def = {
    ...definition,
    rules: [{ ...wellFormedDateRule, right: "start" }],
  };
  const result = evaluateRules(
    def,
    { start: "2027-01-15", end: "2027-12-15" },
    []
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].field, "end");
  assert.equal(result[0].message, "Rule has an invalid operand");
});

test("validateRecord with no rules key is unchanged", () => {
  const result = validateRecord(definition, { start: "2027-01-15", end: "2027-12-15" });
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("validateRecord accepts a record that satisfies a well-formed rule", () => {
  const def = { ...definition, rules: [wellFormedDateRule] };
  const result = validateRecord(def, { start: "2027-01-15", end: "2027-12-15" });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("validateRecord reports a violated rule against the target", () => {
  const def = { ...definition, rules: [wellFormedDateRule] };
  const result = validateRecord(def, { start: "2027-12-15", end: "2027-01-15" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "end" && e.message === "End must not be before start"));
});

test("validateRecord does not add a rule error when a date field is malformed", () => {
  const def = { ...definition, rules: [wellFormedDateRule] };
  const result = validateRecord(def, { start: "15/01/2027", end: "2027-12-15" });
  assert.equal(result.valid, false);
  assert.equal(result.errors.filter((e) => e.field === "start").length, 1);
  assert.ok(!result.errors.some((e) => e.message === "End must not be before start"));
});

test("validateRecord does not add a rule error when a required field is missing", () => {
  const def = { ...definition, rules: [wellFormedDateRule] };
  const result = validateRecord(def, { end: "2027-12-15" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.field === "start"));
  assert.ok(!result.errors.some((e) => e.message === "End must not be before start"));
});
