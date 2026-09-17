/**
 * verify:nox-store-systems — 店舗の「使う制度」9 フラグ（裁定269・mig0147）の純関数 lib/nox/store-systems.ts の係留。
 *   npm run verify:nox-store-systems（env: SUPABASE_DB_URL＝白名単の照合に prosrc を読む・他は DB 非依存）
 *   f0 51 段目。
 *
 *  (1) isSystemOn: 欠損＝ON／false のみ OFF／true・null・数値・文字列は ON／未知キーは ON／settings が null・undefined・非 object でも ON
 *  (2) SECTION_KEYS 17 節と isSectionOn（いずれか ON なら描く・全 OFF で消える）
 *  (3) systemUsageOf: fixture 行で 9 キー集計（base／backs／rate／norms を数える・cast 重複は 1・他 5 キーは常に 0・空入力は全 0）
 *  (4) SYSTEM_KEYS 9 が live の set_store_profile 白名単（prosrc の v_keys）の sys_* 9 と順序込みで一致
 *  逆テスト 2 本（手動・各 1 回）: 欠損を OFF にする→se(1-1) 赤／キー名を 1 つ変える→se(4-1) 赤。
 */
import { Client } from "pg";
import { loadEnvOrExit } from "./fixtures-f0";
import { SECTION_KEYS, SYSTEM_KEYS, SYSTEM_LABELS, isSectionOn, isSystemOn, systemUsageOf } from "../lib/nox/store-systems";

const env = loadEnvOrExit(["SUPABASE_DB_URL"]);

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) pass++;
  else fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}

function pureChecks() {
  // (1) isSystemOn
  check("ss(1-1) ★欠損（{}）は ON", isSystemOn({}, "sys_norms") === true);
  check("ss(1-2) ★false のみ OFF", isSystemOn({ sys_norms: false }, "sys_norms") === false);
  check("ss(1-3) true は ON", isSystemOn({ sys_norms: true }, "sys_norms") === true);
  check("ss(1-4) null 値は ON", isSystemOn({ sys_norms: null }, "sys_norms") === true);
  check("ss(1-5) 数値 0 は ON（boolean 以外は無視）", isSystemOn({ sys_norms: 0 }, "sys_norms") === true);
  check("ss(1-6) 文字列 'false' は ON（boolean 以外は無視）", isSystemOn({ sys_norms: "false" }, "sys_norms") === true);
  check("ss(1-7) 未知キーは ON", isSystemOn({ sys_norms: false }, "sys_unknown") === true);
  check("ss(1-8) settings が null／undefined は ON", isSystemOn(null, "sys_norms") && isSystemOn(undefined, "sys_norms"));
  check("ss(1-9) 他キーの false は影響しない", isSystemOn({ sys_backs: false }, "sys_norms") === true);
  check("ss(1-10) 既存の settings_json キー（okuri_mode 等）が混在しても ON/OFF は sys_* だけで決まる", isSystemOn({ okuri_mode: "flat", biz_cutoff_hm: "06:00", sys_bonus: false }, "sys_bonus") === false && isSystemOn({ okuri_mode: "flat" }, "sys_bonus") === true);

  // (2) SECTION_KEYS
  const secs = Object.keys(SECTION_KEYS);
  check("ss(2-1) 出し分けの節は 17（plan-board 4・plan-editor 4・comp-sections 4・norm-config／deduction／products back／products pt／mine）", secs.length === 17, secs.join(","));
  check("ss(2-2) 各節のキーは SYSTEM_KEYS の要素のみ・空なし", secs.every((s) => { const ks = SECTION_KEYS[s as keyof typeof SECTION_KEYS]; return ks.length > 0 && ks.every((k) => (SYSTEM_KEYS as readonly string[]).includes(k)); }));
  check("ss(2-3) 9 キーとも少なくとも 1 節に現れる（隠す口の無い制度が無い）", SYSTEM_KEYS.every((k) => secs.some((s) => (SECTION_KEYS[s as keyof typeof SECTION_KEYS] as readonly string[]).includes(k))));
  check("ss(2-4) ★歩合・バック節＝各種バック OFF でも売上歩合 ON なら描く", isSectionOn({ sys_backs: false }, "planEditorBacks") === true && isSectionOn({ sys_backs: false, sys_sales_rate: false }, "planEditorBacks") === false);
  check("ss(2-5) ★スライド節＝3 キー全 OFF で消える・1 つ ON で残る", isSectionOn({ sys_sales_slide: false, sys_point_slide: false, sys_points: false }, "planTabSlides") === false && isSectionOn({ sys_sales_slide: false, sys_point_slide: false }, "planTabSlides") === true);
  check("ss(2-6) 単キー節（mine ノルマ）＝sys_norms false で消える", isSectionOn({ sys_norms: false }, "mineNormCard") === false && isSectionOn({}, "mineNormCard") === true);
  check("ss(2-7) 全 ON（{}）で 17 節すべて描く", secs.every((s) => isSectionOn({}, s as keyof typeof SECTION_KEYS)));
  check("ss(2-8) 9 キー全 false で 17 節すべて消える", secs.every((s) => !isSectionOn(Object.fromEntries(SYSTEM_KEYS.map((k) => [k, false])), s as keyof typeof SECTION_KEYS)));
  check("ss(2-9) ラベル 9 語（STEP 3 と同一）", SYSTEM_KEYS.map((k) => SYSTEM_LABELS[k]).join("／") === "時給・最低保証／各種バック／売上歩合／ポイント制／売上スライド／ポイントスライド／ノルマ／罰金・控除／達成ボーナス");

  // (3) systemUsageOf
  const u = systemUsageOf({
    castPlans: [
      { cast_id: "c1", overrides_json: { base: 3500 } },
      { cast_id: "c2", overrides_json: { honBack: 1500, jonaiBack: 700 } },
      { cast_id: "c3", overrides_json: { honBackMode: "rate", honBackRate: 50 } },
      { cast_id: "c4", overrides_json: {} },
      { cast_id: "c5", overrides_json: null },
      { cast_id: "c1", overrides_json: { dohanBack: 2000 } }, // 同じ cast の別期間行＝重複は 1
      { cast_id: "c6", overrides_json: { jonaiBackMode: "per_count", jonaiBack: 400 } },
    ],
    castNorms: [
      { cast_id: "c2", days_target: 10, dohan_target: 0, sales_target: 0, shimei_target: 0 },
      { cast_id: "c7", days_target: 0, dohan_target: 0, sales_target: 0, shimei_target: 0 }, // 全 0＝未使用
      { cast_id: "c8", days_target: null, dohan_target: null, sales_target: 100000, shimei_target: null },
      { cast_id: "c2", days_target: 5, dohan_target: 1, sales_target: 0, shimei_target: 0 }, // 同 cast 別 period＝1
    ],
  });
  check("ss(3-1) ★sys_hourly＝base の上書きを持つ cast 数（c1）", u.sys_hourly === 1, JSON.stringify(u));
  check("ss(3-2) ★sys_backs＝honBack／jonaiBack／dohanBack の上書き（c2・c1・c6＝3）", u.sys_backs === 3, JSON.stringify(u));
  check("ss(3-3) ★sys_sales_rate＝*BackMode='rate' か *BackRate（c3 のみ・c6 は per_count＝数えない）", u.sys_sales_rate === 1, JSON.stringify(u));
  check("ss(3-4) ★sys_norms＝目標 > 0 の行を持つ cast（c2・c8＝2・c7 は全 0）", u.sys_norms === 2, JSON.stringify(u));
  check("ss(3-5) cast 単位の器が無い 5 キーは常に 0", u.sys_points === 0 && u.sys_sales_slide === 0 && u.sys_point_slide === 0 && u.sys_penalties === 0 && u.sys_bonus === 0, JSON.stringify(u));
  check("ss(3-6) 9 キー全部が返る（欠けなし）", SYSTEM_KEYS.every((k) => typeof u[k] === "number"));
  const z = systemUsageOf({ castPlans: [], castNorms: [] });
  check("ss(3-7) 空入力は全 0", SYSTEM_KEYS.every((k) => z[k] === 0));
  const bad = systemUsageOf({ castPlans: [{ cast_id: "x", overrides_json: { base: "3500" } }], castNorms: [] });
  check("ss(3-8) 数値でない base（文字列）は数えない", bad.sys_hourly === 0);
}

async function main() {
  pureChecks();
  // (4) live の白名単と照合
  const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const { rows } = await db.query(`select prosrc from pg_proc where pronamespace='public'::regnamespace and proname='set_store_profile'`);
  await db.end();
  const src: string = String(rows[0]?.prosrc ?? "").replace(/--.*$/gm, ""); // 行末コメントを落とす（0147 の ★1 コメントに '];' が含まれる）
  const m = src.match(/v_keys\s+text\[\]\s*:=\s*array\[([\s\S]*?)\];/);
  const live = m ? [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : [];
  const liveSys = live.filter((k) => k.startsWith("sys_"));
  check("ss(4-0) live の set_store_profile 白名単を読めた（20 キー）", live.length === 20, `${live.length}: ${live.join(",")}`);
  check("ss(4-1) ★SYSTEM_KEYS 9 ＝ live 白名単の sys_* 9（順序込み）", JSON.stringify([...SYSTEM_KEYS]) === JSON.stringify(liveSys), `lib=${SYSTEM_KEYS.join(",")} live=${liveSys.join(",")}`);
  check("ss(4-2) 白名単に setup_done／biz_type／billing_mode も居る（0147 の 12 キー）", ["setup_done", "biz_type", "billing_mode"].every((k) => live.includes(k)));

  if (fails.length) {
    console.log(`FAIL ${fails.length} 件 / pass ${pass}`);
    for (const f of fails) console.log(` - ${f}`);
    process.exit(1);
  }
  console.log(`verify:nox-store-systems ALL PASS (${pass} assertions)`);
  console.log("使う制度(裁定269): isSystemOn 欠損=ON／false のみ OFF・SECTION_KEYS 17 節・systemUsageOf 9 キー集計（cast_plan.overrides_json／cast_norms）・SYSTEM_KEYS＝live 白名単 sys_* 9");
}

main().catch((e) => { console.error("✗ 異常終了", e); process.exit(1); });
