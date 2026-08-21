#!/usr/bin/env node
/**
 * extract-strings.js
 *
 * Scanne récursivement un dossier (par défaut ./src) à la recherche de fichiers
 * .ts / .tsx, et en extrait :
 *   - le texte JSX visible (<div>Texte ici</div>)
 *   - les attributs JSX porteurs de texte (placeholder, label, title, alt,
 *     aria-label, aria-description)
 *
 * Sortie :
 *   - fr.json       -> { "cle-generee": "Texte original" }
 *   - manifest.json -> { "cle-generee": [ { file, line, kind } ] }
 */

const fs = require("fs");
const path = require("path");

let parser, traverse;
try {
  parser = require("@babel/parser");
  traverse = require("@babel/traverse").default;
} catch (e) {
  console.error(
    "\n❌ Dépendances manquantes. Lance d'abord :\n" +
      "   npm install --no-save @babel/parser @babel/traverse\n"
  );
  process.exit(1);
}

const ROOT = path.resolve(process.argv[2] || "./src");
const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".lovable",
  "dist",
  "build",
  ".vercel",
  "supabase",
]);
const EXTENSIONS = new Set([".ts", ".tsx"]);

const TEXT_ATTRIBUTES = new Set([
  "placeholder",
  "label",
  "title",
  "alt",
  "aria-label",
  "aria-description",
  "description",
  "helperText",
  "errorMessage",
  "buttonText",
  "tooltip",
]);

function isLikelyUiText(str) {
  const trimmed = str.trim();
  if (trimmed.length < 2) return false;
  if (/^[\d\s.,:/%-]+$/.test(trimmed)) return false;
  if (/^[a-z0-9_-]+$/i.test(trimmed) && !trimmed.includes(" ") && trimmed.length < 4)
    return false;
  if (/^(https?:\/\/|\/|#|\.\/)/.test(trimmed)) return false;
  if (/^[A-Z_]+$/.test(trimmed) && trimmed.length < 6) return false;
  return true;
}

function slugify(str, maxWords = 5) {
  return str
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, maxWords)
    .join("_")
    .slice(0, 50) || "texte";
}

function walk(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

function extractFromFile(filePath, strings, manifest) {
  const code = fs.readFileSync(filePath, "utf8");
  const relPath = path.relative(process.cwd(), filePath);

  let ast;
  try {
    ast = parser.parse(code, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
    });
  } catch (err) {
    console.warn(`⚠️  Impossible de parser ${relPath}: ${err.message}`);
    return;
  }

  function addString(text, line, kind) {
    if (!isLikelyUiText(text)) return;
    const clean = text.trim().replace(/\s+/g, " ");
    const key = slugify(clean);

    let finalKey = key;
    let suffix = 2;
    while (strings.has(finalKey) && strings.get(finalKey) !== clean) {
      finalKey = `${key}_${suffix}`;
      suffix++;
    }

    strings.set(finalKey, clean);
    if (!manifest.has(finalKey)) manifest.set(finalKey, []);
    manifest.get(finalKey).push({ file: relPath, line, kind });
  }

  traverse(ast, {
    JSXText(nodePath) {
      const line = nodePath.node.loc ? nodePath.node.loc.start.line : null;
      addString(nodePath.node.value, line, "jsx_text");
    },
    JSXAttribute(nodePath) {
      const attrName = nodePath.node.name && nodePath.node.name.name;
      if (!attrName || !TEXT_ATTRIBUTES.has(attrName)) return;
      const value = nodePath.node.value;
      if (value && value.type === "StringLiteral") {
        const line = value.loc ? value.loc.start.line : null;
        addString(value.value, line, `attr:${attrName}`);
      }
    },
  });
}

function main() {
  if (!fs.existsSync(ROOT)) {
    console.error(`❌ Dossier introuvable : ${ROOT}`);
    process.exit(1);
  }

  const files = walk(ROOT);
  console.log(`🔍 ${files.length} fichiers .ts/.tsx trouvés sous ${ROOT}`);

  const strings = new Map();
  const manifest = new Map();

  for (const file of files) {
    extractFromFile(file, strings, manifest);
  }

  const frJson = Object.fromEntries(strings);
  const manifestJson = Object.fromEntries(manifest);

  fs.writeFileSync("fr.json", JSON.stringify(frJson, null, 2), "utf8");
  fs.writeFileSync("manifest.json", JSON.stringify(manifestJson, null, 2), "utf8");

  console.log(`✅ ${strings.size} chaînes de texte extraites.`);
}

main();
