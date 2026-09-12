import { readFile, writeFile } from "node:fs/promises";

const sourceUrl = new URL("../../contracts/abi/ConsentRegistry.json", import.meta.url);
const targetUrl = new URL("../src/consent-abi.json", import.meta.url);
const source = JSON.parse(await readFile(sourceUrl, "utf8"));
const allowed = new Set(["grantWithSig", "revokeWithSig", "nonces"]);
const minimal = source.filter((entry) => entry.type === "function" && allowed.has(entry.name));
if (minimal.length !== allowed.size || minimal.some((entry) => !allowed.has(entry.name))) {
  throw new Error("ConsentRegistry ABI does not contain the required relayer functions");
}
await writeFile(targetUrl, `${JSON.stringify(minimal, null, 2)}\n`, { mode: 0o644 });
