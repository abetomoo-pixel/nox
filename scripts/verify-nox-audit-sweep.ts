/*
 * verify:nox-audit-sweep — f0 冒頭の掃除 gate（裁定139・#58 対処(b)・教訓58）。Postgres 直結（grants 段と同じ経路）。
 *   npm run verify:nox-audit-sweep（env: SUPABASE_DB_URL・postgres・statement_timeout 2min）
 *
 * 背景（#58 実測 2026-09-07）: audit_logs 125,012 行／151 MB のうち 99.3%（124,134 行）が NOX-VERIFY 系 org の
 *   fixture 残骸。verify スイートは書込 RPC ごとに audit_log_write（原則6）で行を積むが、掃除は自スイートの
 *   action／target に限られ追随していなかった。この表を PostgREST（authenticated・statement_timeout 8s）越しに
 *   全件スキャン／削除する statement が 8s 上限に張り付き、小型インスタンスで同時に走る無関係な RPC も
 *   5〜7s へ伸びて timeout する＝f0 フレークの主因（教訓35 の実証例）。
 *
 * 動作: verify org（NOX-VERIFY-A／B）の audit_logs を**全削除**してから f0 を走らせる。
 *   ★org_id の 2 値を直書き（orgs.name には依存しない＝改名・重複名の影響を受けない）。存在確認は id で行い name は表示のみ。
 *   ★対象は verify org の行のみ＝NOX-DEMO ほか本番相当 org の行には触れない（org_id = any(...) の述語で構造的に限定）。
 *   ★audit_logs.id を参照する FK は 0 本・ユーザートリガ 0 本（live 実測）＝DELETE は単独で完結する。
 *   ★verify org 以外の audit_logs は一切触らない。本番の retention は別裁定（ローンチ後・税理士ゲート後）。
 *   ★seed:f0 の常設マーカー（org A・action='seed_marker'・rls 段の被験行）は除外＝無ければ FAIL して seed:f0 再投入を促す
 *     （2026-09-07 の手貼り全消しで marker まで消え rls 段が決定論的に赤になった実例）。
 *
 * 出力: 削除前件数／削除件数／削除後件数（期待 0）。削除後 > 0 なら FAIL。
 *   削除前が WARN_THRESHOLD（5,000 行）を超えていたら warn（肥大の早期検知・fail はしない）。
 */
import { Client } from "pg";
import { loadEnvOrExit } from "./fixtures-f0";

const env = loadEnvOrExit(["SUPABASE_DB_URL"]);

// NOX-VERIFY-A / NOX-VERIFY-B の org_id（live 実測 2026-09-07・seed:f0 が常設する verify 用 org）
const VERIFY_ORG_IDS = [
  "6408ecea-514d-4ca8-aadf-242eaba96377", // NOX-VERIFY-A
  "3b9518ad-317d-4c36-80fe-1039bb98ebdf", // NOX-VERIFY-B
];
const WARN_THRESHOLD = 5000;

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}

async function main() {
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    // 0) 貼り先証明と同型: verify org の id が 2 件とも存在する（無ければ掃除対象の同定ができない＝FAIL）
    const orgs = await db.query<{ id: string; name: string }>(
      `select id, name from public.orgs where id = any($1::uuid[]) order by name`, [VERIFY_ORG_IDS],
    );
    check("sweep-0 verify org の id 2件が orgs に存在", orgs.rowCount === 2,
      `got ${orgs.rowCount}: ${orgs.rows.map((r) => r.name).join(", ")}`);
    if (orgs.rowCount !== 2) return;

    // ★seed:f0 が置く常設マーカー（org A・action='seed_marker'・rls 段「ownerA audit_logs ≥1行」の被験行）は掃除しない。
    //   無ければ seed:f0 の再実行が要る＝ここで検知して止める（手貼りで全消しした場合の取りこぼし＝2026-09-07 実例）。
    const marker = await db.query(
      `select count(*)::bigint as n from public.audit_logs where org_id = any($1::uuid[]) and action = 'seed_marker'`, [VERIFY_ORG_IDS],
    );
    check("sweep-m verify org の seed_marker 行が ≥1（無ければ npm run seed:f0 で再投入）", Number(marker.rows[0].n) >= 1,
      `got ${marker.rows[0].n}`);
    if (Number(marker.rows[0].n) < 1) return;

    const countOf = async () => Number((await db.query(
      `select count(*)::bigint as n from public.audit_logs where org_id = any($1::uuid[]) and action <> 'seed_marker'`, [VERIFY_ORG_IDS],
    )).rows[0].n);
    const totalBefore = Number((await db.query(`select count(*)::bigint as n from public.audit_logs`)).rows[0].n);
    const before = await countOf();
    if (before > WARN_THRESHOLD) {
      console.log(`⚠ warn: verify org の audit_logs が ${before.toLocaleString()} 行（閾値 ${WARN_THRESHOLD.toLocaleString()}）＝` +
        "前回 f0 からの積み残しが多い。掃除は本 gate が行うが、スイート側の delete 追随を疑う（教訓58）");
    }

    // 1) 掃除（単一 statement・verify org のみ）
    const del = await db.query(
      `delete from public.audit_logs where org_id = any($1::uuid[]) and action <> 'seed_marker'`, [VERIFY_ORG_IDS],
    );
    const after = await countOf();
    const totalAfter = Number((await db.query(`select count(*)::bigint as n from public.audit_logs`)).rows[0].n);
    check("sweep-1 削除後の verify org audit_logs = 0 行", after === 0, `got ${after}`);
    check("sweep-2 verify org 以外の行数は不変", totalBefore - before === totalAfter,
      `before total ${totalBefore} - verify ${before} ≠ after total ${totalAfter}`);

    console.log(`verify:nox-audit-sweep 削除前=${before.toLocaleString()} 削除=${(del.rowCount ?? 0).toLocaleString()} ` +
      `削除後=${after} / 残総数=${totalAfter.toLocaleString()}（他 org＋seed_marker）（閾値 ${WARN_THRESHOLD.toLocaleString()}・org 母数 ${orgs.rowCount}/2）`);
  } finally {
    await db.end();
  }
}

main().then(() => {
  if (fails.length) {
    console.log(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.log(" - " + f);
    process.exit(1);
  }
  console.log(`verify:nox-audit-sweep ALL PASS (${pass} assertions)`);
}).catch((e) => { console.error("verify:nox-audit-sweep ERROR:", e?.message ?? e); process.exit(1); });
