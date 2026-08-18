"use strict";

/**
 * Cross-field rules engine.
 *
 * evaluateRules(definition, record, fieldErrors) -> [{ field, message }, ...]
 *
 * This module is deliberately client-agnostic. It knows nothing about any
 * particular client's field names or business rules.
 *
 * A1: returns [] unconditionally. Not wired into validateRecord yet.
 * Later tasks add operand resolution, operators, dependency gating, and
 * malformed-rule handling before validate.js imports this.
 */

function evaluateRules(definition, record, fieldErrors) {
  return [];
}

module.exports = { evaluateRules };
