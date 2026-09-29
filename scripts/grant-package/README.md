# Grant packages

Builds and checks the read-only grant package the app ships (spec 05 §5.1). First package: `grants/crcp-r19/`, built from the government originals in `reference/crc-p/source/`.

```
npm run grant:build            # definitions in crcp-r19/*.mjs → grants/crcp-r19/
npm run grant:check            # the done-checks (also run by `npm test`)
npm run grant:verify-superdoc  # anchors resolved by SuperDoc itself; needs: npm i --no-save superdoc@2.18.0
```

Edit the definitions, never the built files: `package.test.mjs` fails if the package differs from a fresh build.

| Definition | Becomes |
|---|---|
| `crcp-r19/requirements.mjs` | `requirements-table.xlsx` (the five columns of spec 01 §4b), per-row questions |
| `crcp-r19/form-fields.mjs` | `form-map.json` (question text, anchors and positions are read from the DOCX by the build) |
| `crcp-r19/questions.mjs` | `questions.json` |
| `crcp-r19/rules.mjs` | `rules.json`; the `check` language is in `rules-lang.mjs`, which the engine can reuse |

## What the checks prove
- **Wording.** Every requirement row, criterion heading, sub-criterion, state text and Glossary definition is found verbatim in `reference/crc-p/source/text/` (the guidelines, or for declarations and disclosures the application form). Only whitespace and the extraction's list and table markers are normalised; punctuation, quotes and case must match.
- **Anchors.** Every field's `anchor` (where its answer box goes) and `questionAnchor` resolve in the government DOCX the way SuperDoc's `blocks.findText` does: `matches[ordinal]` is a block whose trimmed text equals the anchor text, at `position.block`. `verify-superdoc.mjs` repeats this in SuperDoc in headless Chromium.
- **Limits.** Each character limit in `form-map.json` is the one the form's own text states.
- **Rules.** Every `check` parses, reads only declared facts, passes a valid synthetic project and fails the failing cases in `fixtures.mjs`.
- **Schemas.** Every file parses with the `@gw/shared` schemas without losing anything.
