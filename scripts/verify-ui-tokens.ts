/**
 * verify:ui-tokens — NOX UI トークン guard（裁定132 案・2026-09-07・DB 非接続・純 Node）
 *
 *   npm run verify:ui-tokens                 … 検査（baseline 外の新規ヒットで FAIL）
 *   npm run verify:ui-tokens -- --write-baseline … 現状を baseline へ書き出す（減少方向の更新にのみ使う）
 *
 * 正本 = app/globals.css を**直接 parse**（手書きミラー禁止）。globals.css 内で定義される全カスタムプロパティ
 *   （:root ＋ .nox-dark ＋ 局所セレクタ・コメント除去後）を「定義済み」とする。
 *   ★実測（2026-09-07）: :root は ink/bg/font-sans/font-serif の4本のみで、パレット本体は .nox-dark 側＝
 *     :root 単独を正本にすると既存参照 1,400 件超が未定義になるため、定義ブロックの内訳を出力しつつ全定義を正本とする。
 * 走査 = app/ と components/ の .tsx/.css（app/globals.css 自身と design/ 配下は除外・コメントは除去してから検査）。
 * 検出A = 色リテラルの裸使用（#hex / rgb( / hsl( / CSS プロパティ文脈の色名）。
 * 検出B = 定義されていない var(--…) 参照。
 * baseline = scripts/ui-tokens-baseline.json（既存ヒットを `path|kind|hit` → 件数 で収載）。
 *   baseline 内 = warn・baseline 外 = FAIL。baseline 件数は必ず出力。**減少方向のみ許容**＝
 *   現状ヒットが baseline を下回った鍵は「stale」として warn（baseline から消して良い）。増える方向は FAIL。
 * 出力 = 母数（走査ファイル数）／A 件数／B 件数／baseline 件数。0 は母数付きで出す。
 * ★既存コードの色は本 guard では直さない（報告のみ）＝色の是正は各 UI レーンの裁定で行う。
 */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const GLOBALS = path.join(ROOT, "app", "globals.css");
const BASELINE = path.join(ROOT, "scripts", "ui-tokens-baseline.json");
const SCAN_DIRS = ["app", "components"];
const WRITE = process.argv.includes("--write-baseline");

const rel = (p: string) => path.relative(ROOT, p).split(path.sep).join("/");
const stripBlockComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
const stripLineComments = (s: string) =>
  s.split("\n").map((l) => {
    // 行頭 `//` と「空白 + //」のみコメント扱い（URL の `://` は前が `:` なので残る）
    const i = l.search(/(^|\s)\/\/(?!\/)/);
    if (i < 0) return l;
    const cut = l.slice(i).match(/^\s*/)![0].length + i;
    return l.slice(0, cut);
  }).join("\n");

// ── 1) 正本 parse（globals.css の全カスタムプロパティ定義＋定義元セレクタ）──
type DefMap = Map<string, Set<string>>;
function parseDefinitions(cssPath: string): DefMap {
  const css = stripBlockComments(fs.readFileSync(cssPath, "utf8"));
  const defs: DefMap = new Map();
  const stack: string[] = [];
  let buf = "";
  // 宣言は `;` または `}` で終端（複数行の font-family 宣言も1宣言として扱う）。セレクタは `{` 直前の buf。
  const flush = () => {
    const m = buf.match(/^\s*--([a-z0-9-]+)\s*:/i);
    if (m && stack.length) {
      const sel = stack[stack.length - 1] || "(top)";
      if (!defs.has(m[1])) defs.set(m[1], new Set());
      defs.get(m[1])!.add(sel);
    }
    buf = "";
  };
  for (const ch of css) {
    if (ch === "{") { stack.push(buf.trim().replace(/\s+/g, " ")); buf = ""; continue; }
    if (ch === "}") { flush(); stack.pop(); continue; }
    if (ch === ";") { flush(); continue; }
    buf += ch;
  }
  return defs;
}

// ── 2) 走査対象 ──
function listFiles(): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name === "design" || e.name === "node_modules") continue; walk(p); continue; }
      if (!/\.(tsx|css)$/.test(e.name)) continue;
      if (path.resolve(p) === path.resolve(GLOBALS)) continue;
      out.push(p);
    }
  };
  for (const d of SCAN_DIRS) walk(path.join(ROOT, d));
  return out.sort();
}

// ── 3) 検出 ──
type Hit = { file: string; line: number; kind: "A" | "B"; hit: string; ctx: string };
const RE_HEX = /(?<![\w&%-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;
const RE_FN = /\b(?:rgba?|hsla?)\(/g;
const COLOR_NAMES = "red|blue|green|white|black|gray|grey|orange|yellow|purple|pink|gold|silver|navy|teal|cyan|magenta|brown|beige|ivory|maroon|olive|lime|aqua|coral|salmon|tomato|crimson|indigo|violet";
// 色名は CSS プロパティ文脈のみ（tone 識別子 "gold"|"gold2" や文言は対象外）
const RE_NAME_TSX = new RegExp(`\\b(?:color|background|backgroundColor|borderColor|border(?:Top|Right|Bottom|Left)?|outline(?:Color)?|fill|stroke|boxShadow|textShadow)\\s*[:=]\\s*(?:["'\`]\\s*)?(?:[^"'\`,;]*\\s)?(${COLOR_NAMES})(?=["'\`;,\\s)]|$)`, "g");
const RE_NAME_CSS = new RegExp(`(?:^|[;{]\\s*)(?:color|background(?:-color)?|border(?:-[a-z]+)*|outline(?:-color)?|fill|stroke|box-shadow|text-shadow)\\s*:[^;}]*?\\b(${COLOR_NAMES})\\b`, "g");
const RE_VAR = /var\(\s*--([a-z0-9-]+)\s*(,[^)]*)?\)/gi;

function scan(files: string[], defs: DefMap): Hit[] {
  const hits: Hit[] = [];
  for (const f of files) {
    const raw = fs.readFileSync(f, "utf8");
    const src = stripLineComments(stripBlockComments(raw));
    const isCss = f.endsWith(".css");
    src.split("\n").forEach((l, i) => {
      const ctx = raw.split("\n")[i]?.trim().slice(0, 100) ?? "";
      for (const x of l.matchAll(RE_HEX)) hits.push({ file: rel(f), line: i + 1, kind: "A", hit: x[0], ctx });
      for (const x of l.matchAll(RE_FN)) hits.push({ file: rel(f), line: i + 1, kind: "A", hit: x[0].slice(0, -1) + "(", ctx });
      for (const x of l.matchAll(isCss ? RE_NAME_CSS : RE_NAME_TSX)) hits.push({ file: rel(f), line: i + 1, kind: "A", hit: x[1], ctx });
      for (const x of l.matchAll(RE_VAR)) if (!defs.has(x[1])) hits.push({ file: rel(f), line: i + 1, kind: "B", hit: `--${x[1]}${x[2] ? "(fallback)" : ""}`, ctx });
    });
  }
  return hits;
}

// ── 4) baseline 照合 ──
type Baseline = { version: number; generated: string; note: string; entries: Record<string, number> };
const keyOf = (h: Hit) => `${h.file}|${h.kind}|${h.hit}`;

function main() {
  const defs = parseDefinitions(GLOBALS);
  const bySel = new Map<string, number>();
  for (const sels of defs.values()) for (const s of sels) bySel.set(s, (bySel.get(s) ?? 0) + 1);
  const files = listFiles();
  const hits = scan(files, defs);
  const a = hits.filter((h) => h.kind === "A"), b = hits.filter((h) => h.kind === "B");

  const current: Record<string, number> = {};
  for (const h of hits) current[keyOf(h)] = (current[keyOf(h)] ?? 0) + 1;

  console.log(`verify:ui-tokens 正本=${rel(GLOBALS)} 定義トークン=${defs.size} 名（` +
    [...bySel.entries()].map(([s, n]) => `${s} ${n}`).join(" / ") + "）");
  console.log(`走査ファイル数=${files.length}（${SCAN_DIRS.join(", ")} の .tsx/.css・globals.css と design/ 除外）`);
  console.log(`A 色リテラル=${a.length} 件 / ${new Set(a.map((h) => h.file)).size} ファイル（母数 ${files.length}）`);
  console.log(`B 未定義 var()=${b.length} 件 / ${new Set(b.map((h) => h.hit)).size} 名（母数 ${files.length}）`);

  if (WRITE) {
    const bl: Baseline = {
      version: 1, generated: new Date().toISOString().slice(0, 10),
      note: "verify:ui-tokens の既存ヒット台帳（path|kind|hit → 件数）。減少方向のみ更新可＝新規ヒットは baseline に足さず是正する。",
      entries: Object.fromEntries(Object.entries(current).sort(([x], [y]) => (x < y ? -1 : 1))),
    };
    fs.writeFileSync(BASELINE, JSON.stringify(bl, null, 2) + "\n");
    console.log(`baseline 書出=${Object.keys(bl.entries).length} 鍵 / ${hits.length} 件 → ${rel(BASELINE)}`);
    return;
  }

  const bl: Baseline = fs.existsSync(BASELINE)
    ? (JSON.parse(fs.readFileSync(BASELINE, "utf8")) as Baseline)
    : { version: 1, generated: "-", note: "", entries: {} };
  const blCount = Object.values(bl.entries).reduce((s, n) => s + n, 0);
  console.log(`baseline=${Object.keys(bl.entries).length} 鍵 / ${blCount} 件（${rel(BASELINE)}・${bl.generated}）`);

  const fails: string[] = [], warns: string[] = [], stale: string[] = [];
  for (const [k, n] of Object.entries(current)) {
    const allowed = bl.entries[k] ?? 0;
    if (n > allowed) {
      const ex = hits.filter((h) => keyOf(h) === k).slice(allowed);
      for (const h of ex) fails.push(`${h.file}:${h.line} [${h.kind}] ${h.hit} | ${h.ctx}`);
    } else if (n < allowed) {
      stale.push(`${k} baseline ${allowed} → 現状 ${n}（減少＝baseline を ${n} へ更新可）`);
    }
  }
  for (const [k, n] of Object.entries(bl.entries)) if (!(k in current)) stale.push(`${k} baseline ${n} → 現状 0（消滅＝baseline から削除可）`);
  for (const h of hits) if ((bl.entries[keyOf(h)] ?? 0) > 0) warns.push(`${h.file}:${h.line} [${h.kind}] ${h.hit}`);

  console.log(`warn（baseline 内の既存ヒット）=${warns.length} 件・stale（減少/消滅）=${stale.length} 件・FAIL（baseline 外）=${fails.length} 件`);
  for (const s of stale) console.log("  stale:", s);
  for (const f of fails) console.log("  ✗", f);
  if (fails.length) {
    console.log(`verify:ui-tokens FAIL ${fails.length} 件（baseline 外の色リテラル／未定義トークン＝新規は是正・baseline へ足さない）`);
    process.exit(1);
  }
  console.log(`verify:ui-tokens ALL PASS（新規ヒット 0 件 / 走査 ${files.length} ファイル・baseline ${blCount} 件）`);
}

main();
