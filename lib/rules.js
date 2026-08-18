"use strict";

/**
 * Cross-field rules engine.
 *
 * evaluateRules(definition, record, fieldErrors) -> [{ field, message }, ...]
 * resolveOperand(operand, record, definition) ->
 *   { ok: true, present: boolean, value } | { ok: false, error: string }
 *
 * This module is deliberately client-agnostic. It knows nothing about any
 * particular client's field names or business rules.
 *
 * Operands are only { "field": "name" } or { "value": literal }.
 * A bare string is invalid — it is not a field reference.
 *
 * evaluateRules still returns [] (not wired into validateRecord yet).
 */

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

function evaluateRules(definition, record, fieldErrors) {
  return [];
}

module.exports = { evaluateRules, resolveOperand };
