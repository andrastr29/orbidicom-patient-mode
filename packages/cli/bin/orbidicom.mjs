#!/usr/bin/env node
import { parseArgs } from "../dist/args.js";
import { serve, openBrowser } from "../dist/serve.js";

const opts = parseArgs(process.argv.slice(2));

if (opts.command === "serve") {
  const { url } = await serve(opts);
  if (opts.pacs) {
    console.log(`OrbiDICOM running at ${url}`);
    console.log(`  PACS:  ${opts.pacs}`);
    if (opts.study) console.log(`  study: ${opts.study}`);
    else console.log("  (append ?study=<StudyInstanceUID> or pass --study to open a study)");
  } else {
    console.log(`OrbiDICOM running at ${url} (local mode: drag in .dcm / .nii files)`);
  }
  if (opts.open) openBrowser(url);
  console.log("Press Ctrl+C to stop.");
} else if (opts.command === "init") {
  console.log(
    "Scaffolding is implemented in the CLI plan. For now: clone the repo and `make dev`.",
  );
} else if (opts.command === "ai") {
  console.log("The AI assistant is implemented in the CLI plan (optional, BYO key).");
} else {
  console.log(`Unknown command: ${opts.command}`);
  process.exit(1);
}
