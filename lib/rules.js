"use strict";

/**
 * Cross-field rules engine.
 *
 * evaluateRules(definition, record, fieldErrors) -> [{ field, message }, ...]
 * resolveOperand(operand, record, definition) ->
 *   { ok: true, present: boolean, value } | { ok: false, error: string }
 * compare(left, op, right) ->
 *   { ok: true, matched: boolean } | { ok: false, error: string }
 *
 * This module is deliberately client-agnostic. It knows nothing about any
 * particular client's field names or business rules.
 *
 * Operands are only { "field": "name" } or { "value": literal }.
 * A bare string is invalid — it is not a field reference.
 *
 * compare takes already-resolved values. Numbers compare numerically;
 * YYYY-MM-DD strings lexicographically; booleans support eq/neq only.
 * Mismatched types and unknown ops fail loudly — never JavaScript coercion.
 *
 * shouldEvaluateRule(rule, record, definition, fieldErrors) ->
 *   { run: true } | { run: false, reason: "missing_dependency" | "invalid_dependency" }
 * Skip when a field operand is absent or already failed per-field validation.
 * Unknown/invalid operand shapes are not skips (A5).
 *
 * evaluateRules walks definition.rules: malformed rules emit a loud error;
 * missing/invalid dependencies are skipped; a failed compare uses target+message.
 * A missing rules key returns []. Not wired into validateRecord yet.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ORDERING_OPS = new Set(["gt", "gte", "lt", "lte"]);
const COMPARE_OPS = {
  eq: (a, b) => a === b,
  neq: (a, b) => a !== b,
  gt: (a, b) => a > b,
  gte: (a, b) => a >= b,
  lt: (a, b) => a < b,
  lte: (a, b) => a <= b,
};

function isPresent(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string" && value.trim() === "") return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

function definedFieldNames(definition) {
  const fields = (definition && definition.fields) || [];
  return new Set(fields.map((f) => f.name));
}

function resolveOperand(operand, record, definition) {
  if (operand === null || typeof operand !== "object" || Array.isArray(operand)) {
    return { ok: false, error: "invalid_operand" };
  }

  const hasField = Object.prototype.hasOwnProperty.call(operand, "field");
  const hasValue = Object.prototype.hasOwnProperty.call(operand, "value");
  if (hasField === hasValue) {
    return { ok: false, error: "invalid_operand" };
  }

  if (hasValue) {
    return { ok: true, present: true, value: operand.value };
  }

  if (typeof operand.field !== "string") {
    return { ok: false, error: "invalid_operand" };
  }

  if (!definedFieldNames(definition).has(operand.field)) {
    return { ok: false, error: "unknown_field" };
  }

  const raw = record ? record[operand.field] : undefined;
  if (!isPresent(raw)) {
    return { ok: true, present: false, value: undefined };
  }
  return { ok: true, present: true, value: raw };
}

function compare(left, op, right) {
  if (!Object.prototype.hasOwnProperty.call(COMPARE_OPS, op)) {
    return { ok: false, error: "unknown_op" };
  }

  if (typeof left !== typeof right) {
    return { ok: false, error: "type_mismatch" };
  }

  if (typeof left === "number") {
    if (Number.isNaN(left) || Number.isNaN(right)) {
      return { ok: false, error: "type_mismatch" };
    }
    return { ok: true, matched: COMPARE_OPS[op](left, right) };
  }

  if (typeof left === "boolean") {
    if (ORDERING_OPS.has(op)) {
      return { ok: false, error: "type_mismatch" };
    }
    return { ok: true, matched: COMPARE_OPS[op](left, right) };
  }

  if (typeof left === "string") {
    if (!DATE_RE.test(left) || !DATE_RE.test(right)) {
      return { ok: false, error: "type_mismatch" };
    }
    return { ok: true, matched: COMPARE_OPS[op](left, right) };
  }

  return { ok: false, error: "type_mismatch" };
}

function shouldEvaluateRule(rule, record, definition, fieldErrors) {
  const failedFields = new Set((fieldErrors || []).map((e) => e.field));
  const operands = [rule && rule.left, rule && rule.right];

  for (const operand of operands) {
    if (operand === null || typeof operand !== "object" || Array.isArray(operand)) {
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(operand, "field")) {
      continue;
    }

    const resolved = resolveOperand(operand, record, definition);
    if (!resolved.ok) {
      continue;
    }
    if (failedFields.has(operand.field)) {
      return { run: false, reason: "invalid_dependency" };
    }
    if (!resolved.present) {
      return { run: false, reason: "missing_dependency" };
    }
  }

  return { run: true };
}

function errorField(rule) {
  if (rule && typeof rule.target === "string" && rule.target.trim() !== "") {
    return rule.target;
  }
  if (rule && typeof rule.id === "string" && rule.id.trim() !== "") {
    return rule.id;
  }
  return "_rule";
}

function inspectRule(rule, definition) {
  if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
    return "Rule is not an object";
  }
  if (typeof rule.target !== "string" || rule.target.trim() === "") {
    return "Rule is missing a target field";
  }
  if (typeof rule.message !== "string" || rule.message.trim() === "") {
    return "Rule is missing a message";
  }
  if (!Object.prototype.hasOwnProperty.call(COMPARE_OPS, rule.op)) {
    return "Rule has an unknown operator";
  }

  for (const operand of [rule.left, rule.right]) {
    const resolved = resolveOperand(operand, {}, definition);
    if (resolved.ok) continue;
    if (resolved.error === "unknown_field") {
      return `Rule refers to unknown field "${operand.field}"`;
    }
    return "Rule has an invalid operand";
  }
  return null;
}

function evaluateRules(definition, record, fieldErrors) {
  const rules = definition && definition.rules;
  if (!Array.isArray(rules) || rules.length === 0) {
    return [];
  }

  const errors = [];
  for (const rule of rules) {
    const shapeProblem = inspectRule(rule, definition);
    if (shapeProblem) {
      errors.push({ field: errorField(rule), message: shapeProblem });
      continue;
    }

    const gate = shouldEvaluateRule(rule, record, definition, fieldErrors);
    if (!gate.run) continue;

    const left = resolveOperand(rule.left, record, definition);
    const right = resolveOperand(rule.right, record, definition);
    const compared = compare(left.value, rule.op, right.value);
    if (!compared.ok) {
      const message =
        compared.error === "type_mismatch"
          ? "Rule operands have mismatched types"
          : "Rule has an unknown operator";
      errors.push({ field: errorField(rule), message });
      continue;
    }
    if (!compared.matched) {
      errors.push({ field: rule.target, message: rule.message });
    }
  }
  return errors;
}

module.exports = { evaluateRules, resolveOperand, compare, shouldEvaluateRule };
