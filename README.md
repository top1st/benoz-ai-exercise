# Platform Foundation — validation library

Part 2 of the take-home. `validateRecord(definition, record)` still returns `{ valid, errors }` with `errors` as `[{ field, message }, ...]`. Cross-field checks are declared on the definition as data.

```
review/handover-architecture.md
lib/validate.js              validateRecord
lib/rules.js                 cross-field engine (client-agnostic)
clients/*.json               fixtures, including a real rule on Client B
test/validate.test.js        original suite (unchanged)
test/rules.test.js           cross-field tests
```

## Running it

Node 18+, no dependencies.

```
node --test test/
```

That runs every file under `test/`. `npm test` still runs only `test/validate.test.js` (the original suite). Both must pass.

## Per-field validation

Unchanged. A definition has `fields`: `name`, `label`, `type`, `required`, optional `options` and `constraints`. Types: `text`, `long_text`, `number`, `boolean`, `date` (`YYYY-MM-DD`), `choice`, `multi_choice`, `file`.

A value is **absent** if it is `undefined`, `null`, an empty or whitespace-only string, or an empty array. `0` and `false` are present.

## Cross-field rules

Optional `rules` array, sibling of `fields`. Omit it and behaviour is identical to the original library.

Each rule:

| Key | Required | Meaning |
|---|---|---|
| `left` | yes | operand (see below) |
| `op` | yes | one of `eq`, `neq`, `gt`, `gte`, `lt`, `lte` |
| `right` | yes | operand |
| `target` | yes | field name the error attaches to |
| `message` | yes | error message when the comparison does not match |
| `id` | no | used only if `target` is missing, as a fallback error field |

Operands are objects. There are exactly two shapes:

```json
{ "field": "project_end_date" }
{ "value": 5 }
```

A bare string (`"project_end_date"`) is invalid. An object with both `field` and `value`, or with neither, is invalid.

### Worked example

From `clients/client-b-grant-foundation.json`:

```json
{
  "id": "end_not_before_start",
  "left":  { "field": "project_end_date" },
  "op":    "gte",
  "right": { "field": "project_start_date" },
  "target": "project_end_date",
  "message": "Project end date must not be before project start date"
}
```

`end >= start` holds. If it does not, one error is reported against `project_end_date`.

A literal on one side is the same shape:

```json
{
  "left": { "field": "requested_amount" },
  "op": "lte",
  "right": { "value": 100000 },
  "target": "requested_amount",
  "message": "Requested amount must be at most 100000"
}
```

### Operators and types

| Types | Operators | How |
|---|---|---|
| two numbers | all six | numeric |
| two strings matching `YYYY-MM-DD` | all six | lexicographic (calendar order for that format) |
| two booleans | `eq`, `neq` only | strict equality |

Anything else — including `"10"` vs `9`, boolean `gt`, or a non-date string with `gt` — is a **loud** error (`Rule operands have mismatched types` or `Rule has an unknown operator`), not a failed comparison and not JavaScript coercion.

Unknown `op` is loud: `Rule has an unknown operator`.

### Evaluation order

1. Every field is validated in isolation.
2. Then each rule in `rules` order.
3. Rule errors are appended to the per-field list.
4. `valid` is true only if the combined list is empty.

Several rules may share the same `target`. Each one that fails adds its own error.

### When a rule does not run

If a `{ "field" }` operand is absent, the rule is **skipped** (no rule error). Required-ness is already a per-field error; reporting both would be two errors for one mistake.

If a referenced field already has a per-field error (wrong type, bad date such as `15/01/2027`), the rule is **skipped**. `{ "value" }` literals are not dependencies.

### When a rule is malformed

The rule emits one error and evaluation continues with the next rule. A silent pass is treated as the worst outcome.

Malformed includes: missing/blank `target` or `message`; unknown `op`; `{ "field": "..." }` whose name is not in `fields`; invalid operand shape.

The error's `field` is `target` if that is a non-empty string; otherwise `id`; otherwise `_rule`.

## Design choices

- **Field vs literal.** Explicit objects so a string cannot be mistaken for a field name.
- **One `target`.** Guessing the field, or attaching to both sides, is unpredictable for a reader of the definition.
- **Skip if missing.** The required check already ran.
- **Skip if the dependency failed per-field validation.** Stops cascading nonsense on a bad date.
- **Malformed is loud.** In a blind test, a silent pass looks like success.
- **Where we stopped.** Comparison of two operands, six operators, three type pairs. No arithmetic, no “end = start + 14 days”, no “if status is X then Y is required”, no AND/OR trees, no comparing arbitrary strings with `gt`.

## Tests

The original 16 tests in `test/validate.test.js` were not changed. New behaviour, including missing/invalid dependencies and malformed rules, is in `test/rules.test.js`. `lib/` has no client names and no client field names.
