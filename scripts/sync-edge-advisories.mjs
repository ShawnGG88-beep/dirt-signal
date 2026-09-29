#!/usr/bin/env node
/**
 * Copy shared advisory modules into supabase/functions/_shared for Edge deploy.
 * Run before: supabase functions deploy advisories-daily-sync
 */
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sharedLib = join(root, "shared", "src", "lib");
const targetShared = join(root, "supabase", "functions", "_shared");

const copies = [
  { from: join(sharedLib, "dayNight.ts"), to: join(targetShared, "dayNight.ts") },
  {
    from: join(sharedLib, "growingConstants.ts"),
    to: join(targetShared, "growingConstants.ts"),
  },
];

rmSync(join(targetShared, "advisories"), { recursive: true, force: true });
mkdirSync(join(targetShared, "advisories"), { recursive: true });

for (const entry of copies) {
  mkdirSync(dirname(entry.to), { recursive: true });
  cpSync(entry.from, entry.to);
}

cpSync(join(sharedLib, "advisories"), join(targetShared, "advisories"), {
  recursive: true,
});

// Edge runtime does not need Vitest files
rmSync(join(targetShared, "advisories", "advisories.test.ts"), { force: true });
rmSync(join(targetShared, "advisories", "grapeCultivar.test.ts"), { force: true });

console.log("Synced advisory modules to supabase/functions/_shared");
