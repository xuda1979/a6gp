import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { networkTools } from "../src/acn/tools.ts";

const schema = JSON.parse(await readFile(new URL("../schemas/acn-services.schema.json", import.meta.url), "utf8"));
const tools = networkTools();
assert.equal(schema.oneOf.length, tools.length);
for (const tool of tools) {
  const branch = schema.oneOf.find(b => b.properties.name.const === tool.name);
  assert.ok(branch, `missing tool schema: ${tool.name}`);
  assert.deepEqual(branch.properties.arguments, tool.inputSchema, `tool/schema drift: ${tool.name}`);
  assert.equal(branch.required.includes("idempotencyKey"), !tool.annotations.readOnlyHint);
}
console.log(`ACN catalog/schema consistency PASS (${tools.length} tools)`);
