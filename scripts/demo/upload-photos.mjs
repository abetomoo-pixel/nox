// ★裁定328／329（便 D1・2026-10-02）: デモ写真の投入＝docs/tmp/demo_photos/{casts,staff}/<person_id>.jpg → Storage cast-photos
//   casts: {org_id}/{cast_id}.jpg（casts.photo_updated_at を更新）／staff: {org_id}/u_{user_id}.jpg（users.photo_updated_at を更新・0162）
//   person_id → uuid は docs/demo/ids.json（生成器 gen-demo.mjs が固定）→ org ごとに remapUuid（lib/nox/demo/seed.ts と同式）。
//   staff の写真は people の STAFF 9 名＝users 行は demo の staff ユーザー 1 名だけ（328 追補1 ③）＝残り 8 名は users が無く投入先が無い（dry-run で「結線先なし」に数える）。
//   使い方: node scripts/demo/upload-photos.mjs --dry-run --casts --staff   … 件数と sha256 だけ（Storage は触らない）
//           node scripts/demo/upload-photos.mjs --apply --casts            … 投入（D2・512px に縮小＝sharp が要る・devDependency 追加は D2 で裁定）
//   ★512px 縮小は投入時（D1 では dry-run のみ・縮小器は未結線）。
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const args = process.argv.slice(2);
const MODE = args.includes("--apply") ? "apply" : args.includes("--dry-run") ? "dry-run" : null;
const KINDS = ["casts", "staff"].filter((k) => args.includes(`--${k}`));
if (!MODE || KINDS.length === 0) { console.error("usage: node scripts/demo/upload-photos.mjs --dry-run|--apply --casts [--staff]"); process.exit(2); }
const ROOT = args.find((a) => a.startsWith("--dir="))?.slice(6) ?? "docs/tmp/demo_photos";

/** JPEG の SOF から px を読む（依存なし） */
function jpegDims(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(m)) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}
const ids = fs.existsSync("docs/demo/ids.json") ? JSON.parse(fs.readFileSync("docs/demo/ids.json", "utf8")) : null;

export function planOf(kind, root = ROOT) {
  const dir = path.join(root, kind);
  if (!fs.existsSync(dir)) return { kind, dir, files: [], missingDir: true };
  const files = fs.readdirSync(dir).filter((f) => /\.jpg$/i.test(f)).sort().map((f) => {
    const buf = fs.readFileSync(path.join(dir, f));
    const personId = f.replace(/\.jpg$/i, "");
    const d = jpegDims(buf);
    const uuid = ids?.people?.[personId] ?? ids?.[personId] ?? null;
    const target = kind === "casts" ? (uuid ? `{org_id}/${uuid}.jpg` : null) : (ids?.staff_users?.[personId] ? `{org_id}/u_${ids.staff_users[personId]}.jpg` : null);
    return { file: f, personId, bytes: buf.length, px: d ? `${d.w}x${d.h}` : null, square: !!d && d.w === d.h, sha256: createHash("sha256").update(buf).digest("hex"), uuid, target };
  });
  return { kind, dir, files, missingDir: false };
}

let total = 0;
for (const kind of KINDS) {
  const p = planOf(kind);
  if (p.missingDir) { console.log(`${kind}: ${p.dir} が無い（0 件）`); continue; }
  console.log(`## ${kind} (${p.files.length}) ${p.dir}`);
  for (const f of p.files) console.log(`  ${f.file}  ${f.px ?? "?"}  ${Math.round(f.bytes / 1024)}KB  ${f.sha256.slice(0, 16)}…  ${f.target ?? "結線先なし（ids.json に無い）"}`);
  const bad = p.files.filter((f) => !f.px || !f.square);
  console.log(`  不備: ${bad.length ? bad.map((f) => f.file).join(", ") : "なし"}・結線先なし: ${p.files.filter((f) => !f.target).length}`);
  total += p.files.length;
}
console.log(`合計 ${total} 件`);
if (MODE === "dry-run") { console.log("dry-run: Storage は触っていません（512px 縮小は --apply 時）"); process.exit(0); }
console.error("--apply は D2 で結線（sharp による 512px 縮小＋Storage upload＋photo_updated_at の更新）。本便では実行しません");
process.exit(2);
