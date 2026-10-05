import { readdir, readFile } from "node:fs/promises";

const files = (await readdir(new URL("../schemas/", import.meta.url))).filter((name) => name.endsWith(".json"));
for (const name of files) {
  const text = await readFile(new URL(`../schemas/${name}`, import.meta.url), "utf8");
  const parsed = JSON.parse(text);
  if (parsed.$schema !== "https://json-schema.org/draft/2020-12/schema") throw new Error(`${name}: unexpected JSON Schema dialect`);
  if (!parsed.$id || !parsed.title) throw new Error(`${name}: missing $id/title`);
}
console.log(`schema syntax PASS (${files.length} schemas)`);
