#!/usr/bin/env node
/**
 * Build deploy payload for advisories-daily-sync (run sync-edge-advisories first).
 * Output: .edge-deploy-live.json
 */
import fs from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");
const files = [];

function addFile(name, absPath) {
  files.push({
    name: name.replace(/\\/g, "/"),
    content: fs.readFileSync(absPath, "utf8"),
  });
}

addFile(
  "advisories-daily-sync/deno.json",
  path.join(root, "supabase/functions/advisories-daily-sync/deno.json"),
);
addFile(
  "advisories-daily-sync/index.ts",
  path.join(root, "supabase/functions/advisories-daily-sync/index.ts"),
);

const advisoriesDir = path.join(root, "supabase/functions/_shared/advisories");
for (const name of fs.readdirSync(advisoriesDir)) {
  addFile(`_shared/advisories/${name}`, path.join(advisoriesDir, name));
}
for (const name of ["dayNight.ts", "growingConstants.ts"]) {
  addFile(`_shared/${name}`, path.join(root, "supabase/functions/_shared", name));
}

const payload = {
  project_id: "jrrrwukcasaqyqaidrme",
  name: "advisories-daily-sync",
  entrypoint_path: "advisories-daily-sync/index.ts",
  import_map_path: "advisories-daily-sync/deno.json",
  verify_jwt: true,
  files,
};

const outPath = path.join(root, ".edge-deploy-live.json");
fs.writeFileSync(outPath, JSON.stringify(payload));
console.log(`Wrote ${files.length} files to ${outPath} (${JSON.stringify(payload).length} bytes)`);
