import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");
const test = process.argv.includes("--test");

const targets = test
  ? [{ entryPoints: ["media/test.ts"], outfile: "out/test.js", platform: "node", format: "cjs" }]
  : [
      { entryPoints: ["src/extension.ts"], outfile: "out/extension.js", platform: "node", format: "cjs", external: ["vscode"] },
      { entryPoints: ["media/main.ts"], outfile: "out/webview.js", platform: "browser", format: "iife" },
    ];

for (const t of targets) {
  const options = { bundle: true, sourcemap: true, target: "es2022", logLevel: "info", ...t };
  if (watch) {
    const ctx = await context(options);
    await ctx.watch();
  } else {
    await build(options);
  }
}
