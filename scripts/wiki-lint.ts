#!/usr/bin/env bun
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative, dirname, resolve } from "node:path";
import { execSync } from "node:child_process";
import { parse as parseYaml } from "yaml";

const REPO = resolve(import.meta.dir, "..");
const WIKI = join(REPO, "wiki");
const INDEX = join(WIKI, "index.md");

type FM = {
  title?: string;
  type?: string;
  updated?: string;
  sources?: string[];
  tags?: string[];
};
type Issue = { file: string; kind: string; msg: string };

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith(".md")) out.push(p);
  }
  return out;
}

function parseFrontmatter(src: string): { fm: FM; body: string } {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: src };
  try {
    const fm = (parseYaml(m[1]) ?? {}) as FM;
    return { fm, body: m[2] };
  } catch {
    return { fm: {}, body: m[2] };
  }
}

function extractLinks(body: string): string[] {
  const out: string[] = [];
  const re = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) out.push(m[1]);
  return out;
}

function gitMtime(path: string): number | null {
  try {
    const out = execSync(`git log -1 --format=%ct -- "${path}"`, {
      cwd: REPO,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    return out ? parseInt(out, 10) * 1000 : null;
  } catch {
    return null;
  }
}

// Expand a source entry (possibly a glob) to real repo-relative paths.
// Entries containing "…" are documentation-style ranges — skip glob check.
function resolveSource(entry: string): { paths: string[]; skipped: boolean } {
  if (entry.includes("…") || entry.includes("...")) return { paths: [], skipped: true };
  if (!/[*?[]/.test(entry)) {
    return { paths: [entry], skipped: false };
  }
  const paths: string[] = [];
  const glob = new Bun.Glob(entry);
  for (const match of glob.scanSync({ cwd: REPO, onlyFiles: false })) {
    paths.push(match);
  }
  return { paths, skipped: false };
}

const issues: Issue[] = [];
const files = walk(WIKI);
const indexBody = existsSync(INDEX) ? readFileSync(INDEX, "utf8") : "";

for (const file of files) {
  const rel = relative(REPO, file);
  const src = readFileSync(file, "utf8");
  const { fm, body } = parseFrontmatter(src);
  const isIndex = file === INDEX;
  const isReadme = /\/README\.md$/.test(file);

  // 1. orphan: not referenced from wiki/index.md
  if (!isIndex && !isReadme) {
    const wikiRel = relative(WIKI, file);
    const needle = wikiRel.replace(/\.md$/, "");
    if (!indexBody.includes(wikiRel) && !indexBody.includes(needle)) {
      issues.push({ file: rel, kind: "orphan", msg: "not referenced from wiki/index.md" });
    }
  }

  // 2. front-matter required on content pages
  if (!isReadme && !fm.title) {
    issues.push({ file: rel, kind: "missing-frontmatter", msg: "missing title" });
  }

  // 3. declared sources resolve (supports globs; ellipsis ranges are skipped)
  const resolvedSources: string[] = [];
  for (const s of fm.sources ?? []) {
    const { paths, skipped } = resolveSource(s);
    if (skipped) continue;
    if (paths.length === 0) {
      issues.push({ file: rel, kind: "dead-source", msg: `sources: "${s}" matches nothing` });
      continue;
    }
    for (const p of paths) {
      if (!existsSync(join(REPO, p))) {
        issues.push({ file: rel, kind: "dead-source", msg: `sources: "${p}" not found` });
      } else {
        resolvedSources.push(p);
      }
    }
  }

  // 4. internal markdown links resolve
  for (const link of extractLinks(body)) {
    if (/^(https?:|mailto:|#)/.test(link)) continue;
    const [pathPart] = link.split("#");
    if (!pathPart) continue;
    const resolved = resolve(dirname(file), pathPart);
    if (!existsSync(resolved)) {
      issues.push({ file: rel, kind: "broken-link", msg: `link "${link}" does not resolve` });
    }
  }

  // 5. drift: any declared source newer (in git) than the wiki page
  if (resolvedSources.length) {
    const pageMtime = gitMtime(file);
    if (pageMtime) {
      for (const s of resolvedSources) {
        const srcMtime = gitMtime(join(REPO, s));
        if (srcMtime && srcMtime > pageMtime) {
          issues.push({ file: rel, kind: "drift", msg: `${s} changed after wiki page` });
        }
      }
    }
  }
}

if (issues.length === 0) {
  console.log("wiki: clean");
  process.exit(0);
}

const grouped = new Map<string, Issue[]>();
for (const i of issues) {
  const list = grouped.get(i.kind) ?? [];
  list.push(i);
  grouped.set(i.kind, list);
}

for (const [kind, list] of grouped) {
  console.log(`\n[${kind}] ${list.length}`);
  for (const i of list) console.log(`  ${i.file}: ${i.msg}`);
}

console.log(`\ntotal: ${issues.length}`);
process.exit(1);
