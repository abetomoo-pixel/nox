/*
 * verify:nox-c1114 — 裁定500（2026-11-14・Agoora「他は推奨で」）の client 便 3 点（DB 不触・env 不要・純関数と逐語 pin）。
 *   npm run verify:nox-c1114。
 *  c(1) LIFF の橋の行き先の許可表＝liffDestOf（キャストの /mine にだけ ?to=home／shift／notices を当てる・それ以外の鍵・URL・path は dest のまま）・橋が使う。
 *  c(2) 予約から来店（reservation_to_check）が定休日・臨時休業で止まったら開卓と同じ問い（店長以上）／案内（それ以外）＝register_special_open の後に来店をやり直す。
 *  c(3) 下部タブの高さ --nox-bnav-h＝66px（実のタブ 66＝会計の固定の帯が 2 px かかっていた）。
 *  c(4) お知らせの操作の行は中央寄せ・ホームの未確認の件数の行は金の文字（Agoora 11/14 の実機）。
 *  逆テスト（手動・1 回）: liffDestOf の hasOwnProperty を外して to=constructor を通す→c(1-4) 赤・戻して緑。
 */
import fs from "node:fs";
import { liffDestOf, LIFF_TO_DEST } from "../lib/nox/line/liff-endpoint";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const src = (p: string) => fs.readFileSync(p, "utf8");

// c(1)
check("c(1-1) 許可表＝home／shift／notices の 3 つ", JSON.stringify(LIFF_TO_DEST) === JSON.stringify({ home: "/mine", shift: "/mine/wishes", notices: "/mine/notices" }));
check("c(1-2) キャスト（/mine）＝shift→/mine/wishes・notices→/mine/notices・home→/mine", liffDestOf("/mine", "shift") === "/mine/wishes" && liffDestOf("/mine", "notices") === "/mine/notices" && liffDestOf("/mine", "home") === "/mine");
check("c(1-3) 無し・空・知らない鍵は dest のまま", liffDestOf("/mine", null) === "/mine" && liffDestOf("/mine", "") === "/mine" && liffDestOf("/mine", "payroll") === "/mine");
check("c(1-4) URL・path・Object の名前は通さない（開いたリダイレクトにしない）", ["https://evil.example", "//evil.example", "/dashboard", "constructor", "__proto__", "toString"].every((x) => liffDestOf("/mine", x) === "/mine"));
check("c(1-5) スタッフ・店長（/dashboard）は ?to があっても変えない", liffDestOf("/dashboard", "shift") === "/dashboard" && liffDestOf("/dashboard", "notices") === "/dashboard");
const br = src("app/liff/[storeId]/liff-bridge.tsx");
check("c(1-6) 橋＝成功の行き先は liffDestOf(j.dest, q.get(\"to\"))（dest をそのまま使う行は無い）", br.includes('window.location.replace(liffDestOf(j.dest, q.get("to")));') && !br.includes("window.location.replace(j.dest);"));

// c(2)
const rp = src("app/(manage)/register/reservation-panel.tsx"), rb = src("app/(manage)/register/register-board.tsx");
check("c(2-1) reservation_to_check の失敗＝フラグ 0201d のとき specialOpenStepOf（店長以上＝問い・それ以外＝案内の文を出して止まる）",
  rp.includes("if (error && mig0201dOn()) {") && rp.includes("const sp = specialOpenStepOf(error.message, isManagerUp);")
  && rp.includes('if (sp?.kind === "ask") { setBusy(false); setRsvSp({ id: r.id, closed: sp.closed, step: "ask" }); return; }')
  && rp.includes('if (sp?.kind === "note") { setBusy(false); setRsvSp(null); setMsg(sp.text); return; }'));
check("c(2-2) 問い＝開卓と同じ固定の文（SPECIAL_OPEN_ASK・SPECIAL_OPEN_DOW_ASK・SPECIAL_CLOSED_NOTE）と曜日の候補 spDows",
  rp.includes("{rsvSp.closed ? \"臨時営業にしますか？\" : SPECIAL_OPEN_ASK}") && rp.includes("{SPECIAL_OPEN_DOW_ASK}") && rp.includes("{rsvSp.closed && <div style={{ fontWeight: 700 }}>{SPECIAL_CLOSED_NOTE}</div>}") && rp.includes("data-rsv-special-open-dow={d}"));
check("c(2-3) 曜日を選ぶ＝register_special_open（今日の営業日）→ 親の今日の料金の曜日を更新 → 来店をやり直す",
  rp.includes('await supabase.rpc("register_special_open", { p_store_id: storeId, p_price_dow: dow });') && rp.includes("setRsvSp(null); onSpecialOpened?.(dow);\n    await toCheck(r);"));
check("c(2-4) register-board が isManagerUp・spDows・onSpecialOpened を渡す", rb.includes("isManagerUp={isManagerUp} spDows={spDows} onSpecialOpened={(d) => setTodayPriceDow(d)}"));

// c(3)
const css = src("app/globals.css");
check("c(3-1) --nox-bnav-h: 66px（実のタブの高さ）", /--nox-bnav-h:\s*66px;/.test(css));

// c(4) Agoora 11/14 の実機（375）の 2 点
const nr = src("components/nox/notice-respond.tsx"), mp = src("app/mine/page.tsx");
check("c(4-1) お知らせの「確認しました」・参加／不参加の行は中央寄せ", nr.includes('<div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }} data-notice-actions="1">'));
check("c(4-2) キャストのホームの「お知らせ：未確認・未回答 N 件」は金の文字（既定のリンクの紫で見えなかった）", mp.includes('style={{ display: "block", fontWeight: 700, textDecoration: "none", color: "var(--gold)" }} data-mine-notice-pending={noticePending}'));

if (fails.length) {
  console.error(`verify:nox-c1114 FAIL ${fails.length} / pass ${pass}`);
  for (const f of fails) console.error(" - " + f);
  process.exit(1);
}
console.log(`verify:nox-c1114 OK (${pass} checks)`);
console.log("裁定500 の client 便: LIFF の行き先の許可表・予約から来店の定休日の問い・下部タブの高さ 66");
