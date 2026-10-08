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
const plans = {};
for (const kind of KINDS) {
  const p = planOf(kind);
  plans[kind] = p;
  if (p.missingDir) { console.log(`${kind}: ${p.dir} が無い（0 件）`); continue; }
  console.log(`## ${kind} (${p.files.length}) ${p.dir}`);
  for (const f of p.files) console.log(`  ${f.file}  ${f.px ?? "?"}  ${Math.round(f.bytes / 1024)}KB  ${f.sha256.slice(0, 16)}…  ${f.target ?? "結線先なし（ids.json に無い）"}`);
  const bad = p.files.filter((f) => !f.px || !f.square);
  console.log(`  不備: ${bad.length ? bad.map((f) => f.file).join(", ") : "なし"}・結線先なし: ${p.files.filter((f) => !f.target).length}`);
  total += p.files.length;
}
console.log(`合計 ${total} 件`);
if (MODE === "dry-run") { console.log("dry-run: Storage は触っていません（512px 縮小は --apply 時）"); process.exit(0); }

// ── --apply（★D2-b・裁定335＝sharp は devDependency・2026-10-08）──
//   実体: cast-photos/{org_id}/{cast_id}.jpg（cast_id＝remapUuid(orgId, ids.people[personId])＝lib/nox/demo/seed.ts と同式）／{org_id}/u_{user_id}.jpg（user_id＝demo org の staff ユーザー users.id＝email demo-<店>-staff@nox-demo.local）。
//   縮小: 長辺 512px・JPEG q85・EXIF 回転（lib/nox/cast-photo.ts downscaleToJpeg と同じ形）・2 MiB 超は投入しない（bucket 上限）。
//   打刻: casts.photo_updated_at／users.photo_updated_at を admin で now() に（行が無い＝casts は payload の再生前＝reset 後に afterResetHooks が打刻する）。
//   ★org は NOX-DEMO-<CODE> かつ is_demo=true だけ（本番 org には触れない）。ref は URL の目視（.env.local）。
process.loadEnvFile(".env.local");
const { createClient } = await import("@supabase/supabase-js");
const sharp = (await import("sharp")).default;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) { console.error("env NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY が必要です"); process.exit(2); }
console.log(`apply ref=${(url.match(/https?:\/\/([a-z0-9]+)\./) ?? [])[1] ?? "?"}`);
const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
const BUCKET = "cast-photos", MAX_PX = 512, QUALITY = 85, MAX_BYTES = 2 * 1024 * 1024;
function remapUuid(orgId, id) {
  const h = createHash("sha1").update(`nox-demo:${orgId}:${id.toLowerCase()}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0")}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}
const orgCache = new Map();
async function orgOf(store) {
  if (orgCache.has(store)) return orgCache.get(store);
  const { data } = await admin.from("orgs").select("id, is_demo").eq("name", `NOX-DEMO-${store.toUpperCase()}`).maybeSingle();
  const org = data && data.is_demo === true ? data.id : null;
  orgCache.set(store, org);
  return org;
}
const sum = { uploaded: 0, casts_stamped: 0, users_stamped: 0, no_target: 0, no_org: 0, no_row: 0, failed: 0 };
for (const kind of KINDS) {
  for (const f of plans[kind]?.files ?? []) {
    if (!f.target) { sum.no_target++; continue; }
    const store = f.personId.split("-")[0].toLowerCase();
    const orgId = await orgOf(store);
    if (!orgId) { sum.no_org++; console.log(`  skip ${f.file}: demo org NOX-DEMO-${store.toUpperCase()} が無い`); continue; }
    let objPath, table, rowId;
    if (kind === "casts") { rowId = remapUuid(orgId, f.uuid); objPath = `${orgId}/${rowId}.jpg`; table = "casts"; }
    else {
      const { data: u } = await admin.from("users").select("id").eq("org_id", orgId).eq("email", `demo-${store}-staff@nox-demo.local`).maybeSingle();
      if (!u) { sum.no_row++; console.log(`  skip ${f.file}: staff ユーザー（users）が無い`); continue; }
      rowId = u.id; objPath = `${orgId}/u_${rowId}.jpg`; table = "users";
    }
    const buf = await sharp(fs.readFileSync(path.join(plans[kind].dir, f.file))).rotate().resize({ width: MAX_PX, height: MAX_PX, fit: "inside", withoutEnlargement: true }).jpeg({ quality: QUALITY }).toBuffer();
    if (buf.length > MAX_BYTES) { sum.failed++; console.log(`  fail ${f.file}: 縮小後も ${buf.length} B`); continue; }
    const { error: eUp } = await admin.storage.from(BUCKET).upload(objPath, buf, { upsert: true, contentType: "image/jpeg" });
    if (eUp) { sum.failed++; console.log(`  fail ${f.file}: upload ${eUp.message}`); continue; }
    sum.uploaded++;
    const { data: upd, error: eSt } = await admin.from(table).update({ photo_updated_at: new Date().toISOString() }).eq("org_id", orgId).eq("id", rowId).select("id");
    if (eSt) { console.log(`  warn ${f.file}: ${table}.photo_updated_at ${eSt.message}`); }
    else if (!upd?.length) { sum.no_row++; console.log(`  note ${f.file}: ${objPath}（${buf.length} B）投入済み・${table} 行なし＝reset 後に afterResetHooks が打刻`); }
    else { if (table === "casts") sum.casts_stamped++; else sum.users_stamped++; console.log(`  ok ${f.file} → ${objPath}（${buf.length} B）・${table}.photo_updated_at`); }
  }
}
console.log("apply 集計: " + JSON.stringify(sum));
process.exit(sum.failed ? 1 : 0);
