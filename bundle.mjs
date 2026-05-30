#!/usr/bin/env node

/**
 * bundle.mjs — Produces a single self-contained HTML file (dist/index.html)
 * that can be opened directly in a browser with no server required.
 *
 * Usage:  node bundle.mjs
 *
 * What it does:
 *  1. Reads index.html
 *  2. Inlines all <link rel="stylesheet"> as <style> blocks
 *  3. Bundles ES modules (js/main.js + its imports) into a single <script>
 *     using esbuild (zero-config, ships with Node 24+)
 *  4. Writes the result to dist/index.html
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = __dirname;

// --- Helpers ---
const read = (rel) => readFileSync(resolve(root, rel), "utf-8");

// --- 1. Bundle JS modules with esbuild ---
// Check if esbuild is available, install temporarily if not
let esbuildBin;
try {
  execSync("npx --yes esbuild@0.21.x --version", { cwd: root, stdio: "pipe" });
  esbuildBin = "npx --yes esbuild@0.21.x";
} catch {
  console.error(
    "esbuild is required. Install it with: npm install --save-dev esbuild"
  );
  process.exit(1);
}

console.log("Bundling JS modules...");
const bundledJS = execSync(
  `${esbuildBin} js/main.js --bundle --format=iife --minify`,
  { cwd: root, encoding: "utf-8" }
);

// --- 2. Read and inline CSS (minified via esbuild) ---
console.log("Inlining & minifying CSS...");
const normalizeCSS = execSync(
  `${esbuildBin} normalize.css --bundle --minify`,
  { cwd: root, encoding: "utf-8" }
);
const styleCSS = execSync(
  `${esbuildBin} style.css --bundle --minify`,
  { cwd: root, encoding: "utf-8" }
);

// --- 3. Process HTML ---
console.log("Processing HTML...");
let html = read("index.html");

// Replace CSP: remove it entirely for the bundled file.
// 'self' and origin-based policies are meaningless for file: URLs
// (browsers treat each file: URL as a unique opaque origin).
// Since this is a self-contained local tool, CSP provides no security benefit.
html = html.replace(
  /\s*<meta\s+http-equiv="Content-Security-Policy"[^>]*>\s*/,
  ""
);

// Replace CSS links with inline <style>
html = html.replace(
  /\s*<link\s+rel="stylesheet"\s+href="normalize\.css"\s*\/?\s*>\s*/,
  ""
);
html = html.replace(
  /\s*<link\s+rel="stylesheet"\s+href="style\.css"\s*\/?\s*>\s*/,
  `\n    <style>\n${normalizeCSS}\n${styleCSS}\n    </style>\n`
);

// Replace module script tag with bundled inline version
html = html.replace(
  /\s*<script\s+type="module"\s+src="js\/main\.js"\s*><\/script>\s*/,
  `\n    <script>${bundledJS}</script>\n`
);

// --- 4. Minify HTML ---
console.log("Minifying HTML...");
html = html
  .replace(/<!--[\s\S]*?-->/g, "")           // strip comments
  .replace(/^\s+/gm, "")                     // strip leading whitespace per line
  .replace(/\n{2,}/g, "\n")                   // collapse multiple newlines
  .replace(/>\s+</g, "><")                    // collapse whitespace between tags
  .trim();

// --- 5. Write output ---
const outDir = resolve(root, "dist");
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, "index.html");
writeFileSync(outPath, html, "utf-8");

const sizeKB = (Buffer.byteLength(html, "utf-8") / 1024).toFixed(1);
console.log(`\n✓ Bundled to dist/index.html (${sizeKB} KB)`);
