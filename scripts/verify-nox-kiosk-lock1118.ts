/*
 * verify:nox-kiosk-lock1118 — 店の端末の「スタッフでログイン（PIN）」の直し（2026-11-18 夜・相談役 ⑥ B）。DB 不触・env 不要＝純関数とソースの逐語 pin。
 *  kl(1) ロック中の案内（deviceLockNoteOf）＝残りの分は locked_until があるときだけ（lockRemainOf・フラグに依らない）・「誰かを選ぶ必要はありません」は含まない。
 *  kl(2) ロックが効いているか（deviceLockActiveOf）・開いた時点の確かめの返り（deviceLockProbeOf）。
 *  kl(3) 開いた時点の確かめ＝PIN なしの kiosk_unlock。mig の本文で「端末のロックの確かめ」が「bad_pin」より前・その前に書込が無い（数えない）・0201g より後に kiosk_unlock を作り直す mig が無い。
 *  kl(4) PIN パッド＝「名前を選んで入る」はいつも出す・ロック中はキーと「解除」を畳み主ボタンに・device_locked の返りでトーストを重ねない。
 *  kl(5) 名前の一覧のモーダルの地を不透明に（Modal の opaque・入口だけが渡す）。
 *  kl(6) タイルの画面の人のカードの並びに見出し「出退勤の打刻」（「スタッフでログイン（PIN）」より下・カードより上）。
 *  逆テスト（手動・1 回）: kiosk-unlock-pad の `{!named && (` を `{locked && !named && (` に戻す→kl(4-1) 赤・戻して緑。
 */
import fs from "node:fs";
import { deviceLockActiveOf, deviceLockNoteOf, deviceLockProbeOf, DEVICE_LOCK_PROBE_ARGS } from "../lib/nox/kiosk/device-lock";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: unknown) { if (ok) pass++; else fails.push(`${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");

// ── kl(1) 案内の文 ──
const now = Date.parse("2026-11-18T12:00:00Z");
const n1 = deviceLockNoteOf("2026-11-18T12:04:01Z", now), n0 = deviceLockNoteOf(null, now), nPast = deviceLockNoteOf("2026-11-18T11:59:00Z", now);
check("kl(1-1) 残りあり＝（あと N 分で解除）を添える",
  n1 === "PIN の失敗が続いたため、この端末は PIN だけでは入れません（あと 5 分で解除）。「名前を選んで入る」から、自分の名前と PIN で入れます。出退勤は今までどおり使えます。", n1);
check("kl(1-2) locked_until が無い・過ぎた＝残りを書かない",
  n0 === "PIN の失敗が続いたため、この端末は PIN だけでは入れません。「名前を選んで入る」から、自分の名前と PIN で入れます。出退勤は今までどおり使えます。" && nPast === n0, [n0, nPast]);
check("kl(1-3) 「誰かを選ぶ必要はありません」を含まない", !n1.includes("誰かを選ぶ") && !n0.includes("誰かを選ぶ"));

// ── kl(2) 状態の純関数 ──
check("kl(2-1) deviceLockActiveOf＝無い／壊れた値はロック中のまま・先の時刻は true・過ぎた時刻は false",
  deviceLockActiveOf(null, now) && deviceLockActiveOf("壊れた値", now) && deviceLockActiveOf("2026-11-18T12:00:30Z", now) && !deviceLockActiveOf("2026-11-18T12:00:00Z", now) && !deviceLockActiveOf("2026-11-18T11:00:00Z", now));
const pr = [
  deviceLockProbeOf({ ok: false, reason: "device_locked", locked_until: "2026-11-18T12:03:00Z" }),
  deviceLockProbeOf({ ok: false, reason: "device_locked" }),
  deviceLockProbeOf({ ok: false, reason: "bad_pin" }),
  deviceLockProbeOf(null),
  deviceLockProbeOf({ ok: true }),
];
check("kl(2-2) deviceLockProbeOf＝device_locked だけロック中（locked_until は文字列のときだけ）・bad_pin／null／ok はロックしていない",
  pr[0].locked && pr[0].lockedUntil === "2026-11-18T12:03:00Z" && pr[1].locked && pr[1].lockedUntil === null && !pr[2].locked && !pr[3].locked && !pr[4].locked, pr);

// ── kl(3) 開いた時点の確かめ＝PIN なしの kiosk_unlock（書込の無い順）──
check("kl(3-1) 確かめの引数＝PIN も名前も渡さない", DEVICE_LOCK_PROBE_ARGS.p_pin === null && DEVICE_LOCK_PROBE_ARGS.p_membership_id === null && Object.keys(DEVICE_LOCK_PROBE_ARGS).length === 2);
const migs = fs.readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
const defs = migs.filter((f) => /function public\.kiosk_unlock\(/i.test(src(`supabase/migrations/${f}`)));
check("kl(3-2) kiosk_unlock を最後に作り直した mig＝0201r（★2026-11-18 21:57 適用・後の mig が作り直したら順の pin を見直す）", defs[defs.length - 1] === "0201r_kiosk_cast_pin_lock5.sql", defs);
{
  const m = src("supabase/migrations/0201r_kiosk_cast_pin_lock5.sql"); // ★0201r: 最後に kiosk_unlock を作り直した mig の本文で順を見る
  const a = m.search(/function public\.kiosk_unlock\(/i), b = m.indexOf("$function$;", a);
  const body = m.slice(a, b);
  const iDL = body.indexOf("if v_device.locked_until is not null and v_device.locked_until > now() then return jsonb_build_object('ok', false, 'reason', 'device_locked', 'locked_until', v_device.locked_until); end if;");
  const iBad = body.indexOf("then return jsonb_build_object('ok', false, 'reason', 'bad_pin'); end if;");
  const head = body.slice(0, iBad);
  check("kl(3-3) 本文＝端末のロックの確かめが bad_pin より前・名前の入口（p_membership_id）はその前に返る",
    a > 0 && iDL > 0 && iBad > iDL && body.indexOf("if p_membership_id is not null then") > 0 && body.indexOf("if p_membership_id is not null then") < iDL, { a, iDL, iBad });
  check("kl(3-4) bad_pin までに書込が無い（失敗回数・ロック・監査を数えない）＝確かめで端末の失敗は増えない",
    iBad > 0 && !/update public\./i.test(head) && !/insert into/i.test(head) && !head.includes("audit_log_write"));
}

// ── kl(4) PIN パッド ──
const kp = src("components/nox/kiosk-unlock-pad.tsx");
check("kl(4-1) 「名前を選んで入る」はいつも出す（ロック中だけの条件を外した）",
  kp.includes("{!named && (/* ★相談役 C: ロック中の画面に「名前を選んで入る」 ★2026-11-18 夜（相談役 ⑥ B）") && !kp.includes("{locked && !named && (") && (kp.match(/data-kiosk-unlock-by-name="1">名前を選んで入る<\/button>/g) ?? []).length === 2);
check("kl(4-2) ロック中＝キーと「解除」を畳み、案内と主ボタン（btnPrimary56）・通常の枝は畳んでいないときだけ",
  kp.includes('{tab === "pin" && !cands && !people && lockOn && !named && (') && kp.includes('{tab === "pin" && !cands && !people && !(lockOn && !named) && (')
  && kp.includes('data-kiosk-unlock-lock-note="1">{deviceLockNoteOf(lockedUntil, now)}</p>') && kp.includes('<button style={t.btnPrimary56} disabled={busy} onClick={() => void openPeople()} data-kiosk-unlock-by-name="1">名前を選んで入る</button>'));
{
  const lockedBlock = kp.slice(kp.indexOf('data-kiosk-unlock-locked="1"'), kp.indexOf('{tab === "pin" && !cands && !people && !(lockOn && !named) && ('));
  check("kl(4-3) ロック中の枠に PIN のキー・「解除」・「誰かを選ぶ必要はありません」が無い", lockedBlock.length > 0 && !lockedBlock.includes("<PinPad") && !lockedBlock.includes(">解除</button>") && !lockedBlock.includes("誰かを選ぶ"));
}
check("kl(4-4) 開いた時点の確かめ＝mount で PIN なしの kiosk_unlock（束縛済みの端末の印を添える）・device_locked の返りで残りを持ち、トーストは重ねない",
  kp.includes('const { data, error } = await createClient().rpc("kiosk_unlock", { ...DEVICE_LOCK_PROBE_ARGS, ...(mig0190On() ? { p_device_fp: browserDeviceFp() } : {}) });')
  && kp.includes("if (p.locked) { setLocked(true); setLockedUntil(p.lockedUntil); setNow(Date.now()); }")
  && kp.includes('if (!r.ok && r.reason === "device_locked") { setLocked(true); setLockedUntil((r as { locked_until?: string | null }).locked_until ?? null); setNow(Date.now()); setMsg(null); setPin(""); return; }')
  && kp.includes("const lockOn = locked && deviceLockActiveOf(lockedUntil, now);") && kp.includes("setInterval(() => setNow(Date.now()), 15000)"));

// ── kl(5) モーダルの地 ──
const md = src("components/ui/modal.tsx"), pe = src("components/nox/kiosk-person-entry.tsx");
check("kl(5-1) Modal の opaque＝既定 false・true のときだけ地を var(--card)・入口が渡す",
  md.includes('scroll = false, opaque = false, children,') && md.includes('...(opaque ? { background: "var(--card)" } : null),') && pe.includes("<Modal onClose={() => { if (!busy) close(); }} maxWidth={460} opaque>"));

// ── kl(6) タイルの画面の見出し ──
const pg = src("app/kiosk/page.tsx");
{
  const iHead = pg.indexOf('data-kiosk-punch-head="1"'), iEntry = pg.indexOf("{mig0196On() ? <KioskPersonEntry /> :"), iTabs = pg.indexOf('aria-label="打刻する人"'), iGrid = pg.indexOf('data-kiosk-grid="1"');
  check("kl(6-1) 見出し「出退勤の打刻」と「名前を選んでください」＝「スタッフでログイン（PIN）」より下・グループのタブとカードより上・1 か所",
    iHead > 0 && iEntry > 0 && iEntry < iHead && iHead < iTabs && iHead < iGrid && pg.includes(">出退勤の打刻</h2>") && pg.split(">名前を選んでください</p>").length === 2, { iHead, iEntry, iTabs, iGrid });
}

if (fails.length) {
  console.error(`verify:nox-kiosk-lock1118 FAIL ${fails.length} / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-kiosk-lock1118 OK (${pass} checks)`);
console.log("店の端末の PIN の入口: 名前を選んで入るをいつも出す・ロック中はキーを畳む・開いた時点のロック・モーダルの地・出退勤の見出し");
