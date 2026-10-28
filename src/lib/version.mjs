// The package version, read once from package.json so no file repeats it by hand.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const VERSION = JSON.parse(readFileSync(join(import.meta.dir, "..", "..", "package.json"), "utf8")).version;
