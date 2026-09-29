// Converts a zod schema to the JSON Schema subset both providers accept for structured output
// (docs/research/llm.md): every object closed and every property required; no length, range or
// item-count limits (code checks those after the call, §7.3). The zod schema itself stays the
// real check: every output is validated against it in code.
import { z } from "zod";

type Json = { [key: string]: unknown };

/** Keywords removed from every schema node (never from a `properties` map, whose keys are field names). */
const DROP = new Set([
  "$schema",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "maxItems",
  "pattern",
  "format",
  "default",
]);

/** Keywords whose value is a map of name → schema. */
const SCHEMA_MAPS = new Set(["properties", "$defs", "definitions", "patternProperties"]);
/** Keywords whose value is a schema or a list of schemas. */
const SCHEMA_VALUES = new Set(["items", "prefixItems", "anyOf", "oneOf", "allOf", "not", "additionalProperties", "contains"]);

function strictNode(node: unknown): unknown {
  if (node === null || typeof node !== "object" || Array.isArray(node)) return node;
  const out: Json = {};
  for (const [k, v] of Object.entries(node as Json)) {
    if (DROP.has(k)) continue;
    if (k === "minItems") {
      // Only 0 and 1 are accepted.
      if (typeof v === "number" && v <= 1) out[k] = v;
      continue;
    }
    if (SCHEMA_MAPS.has(k) && v && typeof v === "object") {
      out[k] = Object.fromEntries(Object.entries(v as Json).map(([name, s]) => [name, strictNode(s)]));
    } else if (SCHEMA_VALUES.has(k)) {
      out[k] = Array.isArray(v) ? v.map(strictNode) : strictNode(v);
    } else {
      out[k] = v; // enum, const, type, required, description…: data, not schemas
    }
  }
  if (out.type === "object" || out.properties) {
    const props = (out.properties ?? {}) as Json;
    out.properties = props;
    out.required = Object.keys(props);
    out.additionalProperties = false;
  }
  return out;
}

export function toStrictJsonSchema(schema: z.ZodType): Json {
  const raw = z.toJSONSchema(schema, { target: "draft-2020-12", unrepresentable: "any", io: "output" });
  return strictNode(raw) as Json;
}
