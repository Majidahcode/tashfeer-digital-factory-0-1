#!/usr/bin/env node
/**
 * P1-01: colour literals are only allowed in src/styles/tokens.css.
 * Components must use var(--token) or color-mix(..., var(--token) ..., transparent).
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const SRC = "src";
const ALLOWED = new Set([path.normalize("src/styles/tokens.css")]);
const SKIP_DIRS = new Set(["generated"]);
const EXTENSIONS = new Set([".ts", ".tsx", ".css", ".mjs", ".js"]);

const HEX = /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![\w-])/g;
const COLOR_FN = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(\s*[\d.]/g;
const NAMED = /\b(?:white|black|red|green|blue|cyan|teal|navy|aqua|yellow|gold|orange|purple|magenta|fuchsia|gray|grey|silver|lime|olive|maroon)\b/gi;

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(p);
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      yield p;
    }
  }
}

/** Returns a list of violations: { file, line, match }. */
export async function findColorLiterals(root = process.cwd()) {
  const violations = [];
  for await (const file of walk(path.join(root, SRC))) {
    const rel = path.normalize(path.relative(root, file));
    if (ALLOWED.has(rel)) continue;
    // strip block comments but keep their newlines so reported line numbers stay accurate
    const text = (await readFile(file, "utf8")).replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
    const lines = text.split("\n");
    lines.forEach((raw, i) => {
      const line = rel.endsWith(".css") ? raw : raw.replace(/(^|[^:])\/\/.*$/, "$1");
      const isCss = rel.endsWith(".css");
      const checks = [...line.matchAll(HEX), ...line.matchAll(COLOR_FN)];
      if (isCss && !line.trim().startsWith("@")) {
        // named colours only matter inside declaration values: drop selectors (text before "{") and var(--…) names
        const body = (line.includes("{") ? line.slice(line.lastIndexOf("{") + 1) : line).replace(/var\([^)]*\)/g, "var()");
        for (const decl of body.matchAll(/:\s*([^;{}]+)/g)) checks.push(...(decl[1] ?? "").matchAll(NAMED));
      }
      for (const m of checks) violations.push({ file: rel, line: i + 1, match: m[0] });
    });
  }
  return violations;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const v = await findColorLiterals();
  if (v.length) {
    console.error(`colour literals outside src/styles/tokens.css:\n${v.map((x) => `  ${x.file}:${x.line}  ${x.match}`).join("\n")}`);
    process.exit(1);
  }
  console.log("tokens check passed: no colour literals outside src/styles/tokens.css");
}
