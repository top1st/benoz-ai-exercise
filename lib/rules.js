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
 * evaluateRules still returns [] (not wired into validateRecord yet).
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

function evaluateRules(definition, record, fieldErrors) {
  return [];
}

module.exports = { evaluateRules, resolveOperand, compare };
