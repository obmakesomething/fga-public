import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const SCHEMA_FILES = Object.freeze({
  "transition-contract-projection-v2": "transition-contract-projection-v2.schema.json",
  "verification-identity-input-v1": "verification-identity-input-v1.schema.json",
  "verification-identity-v1": "verification-identity-v1.schema.json",
  "delivery-decision-v1": "delivery-decision-v1.schema.json"
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const registry = new Map(
  Object.entries(SCHEMA_FILES).map(([schemaId, fileName]) => {
    const url = new URL(`../schemas/${fileName}`, import.meta.url);
    const raw = readFileSync(url);
    const schema = JSON.parse(raw.toString("utf8"));
    const descriptor = Object.freeze({
      schemaId,
      fileName,
      packagePath: `schemas/${fileName}`,
      documentId: typeof schema.$id === "string" ? schema.$id : "",
      sha256: createHash("sha256").update(raw).digest("hex"),
    });
    return [schemaId, Object.freeze({ descriptor, schema })];
  }),
);

export const PUBLIC_SCHEMA_IDS = Object.freeze([...registry.keys()]);

export const PUBLIC_SCHEMA_DESCRIPTORS = Object.freeze(
  PUBLIC_SCHEMA_IDS.map((schemaId) => registry.get(schemaId).descriptor),
);

function requireEntry(schemaId) {
  if (!registry.has(schemaId)) {
    throw new RangeError(
      `Unknown public schema ${String(schemaId)}. Expected one of: ${PUBLIC_SCHEMA_IDS.join(", ")}`,
    );
  }
  return registry.get(schemaId);
}

export function getPublicSchema(schemaId) {
  return clone(requireEntry(schemaId).schema);
}

export function getPublicSchemaDescriptor(schemaId) {
  return clone(requireEntry(schemaId).descriptor);
}

export function getPublicSchemaManifest() {
  return PUBLIC_SCHEMA_DESCRIPTORS.map((descriptor) => clone(descriptor));
}
