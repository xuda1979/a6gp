import { createHash, randomUUID } from "node:crypto";

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(obj).sort().map((key) => [key, normalize(obj[key])]),
    );
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new TypeError("canonical JSON forbids non-finite numbers");
  }
  return value;
}

export function canonical(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function sha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonical(value)).digest("hex")}`;
}

export function newId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}
