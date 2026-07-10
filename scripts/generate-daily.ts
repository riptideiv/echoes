import { runDailyPipeline } from "../lib/pipeline";

async function main() {
  console.log("Running daily idea pipeline…");
  const r = await runDailyPipeline();
  console.log("\n=== Run report ===");
  console.log(`date:            ${r.date}`);
  console.log(`sources:         ${r.sourcesTotal}`);
  console.log(`themes:          ${r.themesTotal} (new ${r.themesNew}, cached ${r.themesCached})`);
  console.log(`ideas created:   ${r.ideasCreated}`);
  console.log(`LLM calls:       ${r.llmCallsAfter - r.llmCallsBefore}`);
  if (r.errors.length) {
    console.log(`errors:          ${r.errors.length}`);
    for (const e of r.errors) console.log(`  - ${e}`);
  }
  if (r.themesNew === 0) {
    console.log("\nAll themes were cached — no new LLM generation. ✔");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
