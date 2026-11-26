/*
 * verify:nox-time-input — ★相談役 11/26 夜便 N の N1／N1-e／N1-f（2026-11-26）: 時刻の選択（components/ui/time-input.tsx）の係留。DB・env に触れない。
 *  (1) N1-f 直接入力（lib/nox/time/hhmm-input.ts の typedTimeOf）: 2610→26:10・0930→09:30・930→09:30・２６１０・２６：１０→26:10・2660／9999 は理由の文で断る・
 *      23 時までの欄に 2610 は断る・空は何も書かない・2 桁以下（26）は今のまま 26:00。受ける範囲は今の normalizeHHMM と同じ（全数で突き合わせ＝広げない・狭めない）。
 *  (2) N1-e 空の欄の初めの位置（timeAnchorOf・timeEdgeOf）: 開始の欄＝営業開始・終了の欄＝営業終了・呼び出し側が startAt を渡せばそれ。
 *      開いて閉じても値を書かない＝部品の中で onChange を呼ぶのは「分を押す」「営業開始／営業終了」「決定（直接入力）」だけ（開く・Esc・外を押すは setOpen だけ）。
 *  (3) N1 小窓の置き場: .nox-dark の直下へ portal・画面に固定（.nox-time-pop.is-fixed＝position:fixed・z 1000）・外を押した判定は小窓も含める・左は画面に収める（timePopPlaceOf）。
 *  使い方: npm run verify:nox-time-input
 */
import fs from "node:fs";
import path from "node:path";
import { typedTimeOf, timeAnchorOf, timeEdgeOf, timePopPlaceOf, TYPED_TIME_FORMAT_ERR } from "../lib/nox/time/hhmm-input";
import { normalizeHHMM } from "../lib/nox/time/hhmm";

let pass = 0;
const fails: string[] = [];
function check(label: string, ok: boolean, detail?: string) { if (ok) pass++; else fails.push(`${label}${detail ? `: ${detail}` : ""}`); }
const src = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
const val = (raw: string, maxHour = 47) => { const r = typedTimeOf(raw, maxHour); return r.kind === "ok" ? r.value : r.kind; };
const err = (raw: string, maxHour = 47) => { const r = typedTimeOf(raw, maxHour); return r.kind === "bad" ? r.err : ""; };

// ── (1) N1-f 直接入力 ──
check("ti(1-1) 4 桁 2610→26:10・0930→09:30（終了の欄＝47 時まで）", val("2610") === "26:10" && val("0930") === "09:30");
check("ti(1-2) 3 桁 930→09:30", val("930") === "09:30" && val("930", 23) === "09:30");
check("ti(1-3) 全角 ２６１０・２６：１０→26:10", val("２６１０") === "26:10" && val("２６：１０") === "26:10");
check("ti(1-4) 今までの形 26:10・9:30 はそのまま（分は丸めない＝15 分刻みに寄せない）", val("26:10") === "26:10" && val("9:30") === "09:30" && val("20:20") === "20:20");
check("ti(1-5) 2660 は断る＝分の理由", val("2660") === "bad" && err("2660") === "分は 00〜59 で入れてください");
check("ti(1-6) 9999 は断る＝時の理由（47 時の欄は「翌23時台まで」）", val("9999") === "bad" && err("9999") === "時は 47 時（翌23時台）までです");
check("ti(1-7) 23 時までの欄（開始）に 2610／26:10 は断る＝理由の文", val("2610", 23) === "bad" && err("2610", 23).includes("23:59 まで") && err("26:10", 23) === err("2610", 23));
check("ti(1-8) 形の違う値は断る（例を添える）", err("ab") === TYPED_TIME_FORMAT_ERR && err("26100") === TYPED_TIME_FORMAT_ERR && err("2:6:1") === TYPED_TIME_FORMAT_ERR && TYPED_TIME_FORMAT_ERR.includes("2610"));
check("ti(1-9) 空（空白だけも）は empty＝何も書かない", typedTimeOf("").kind === "empty" && typedTimeOf("  ").kind === "empty" && typedTimeOf(null).kind === "empty");
check("ti(1-10) 2 桁以下は今のまま（26→26:00・9→09:00・23 時までの欄の 26 は断る）", val("26") === "26:00" && val("9") === "09:00" && val("26", 23) === "bad");
{
  // 受ける範囲は今の normalizeHHMM と同じ＝全数（0〜9999 の 1〜4 桁・H:MM／HH:MM）を 23 と 47 の欄で突き合わせる（広げない・狭めない）
  const diffs: string[] = [];
  const inputs: string[] = [];
  for (let n = 0; n <= 9999; n++) { const s = String(n); inputs.push(s); if (s.length < 4) inputs.push(s.padStart(4, "0")); if (s.length < 3) inputs.push(s.padStart(3, "0")); }
  for (let h = 0; h <= 99; h++) for (let m = 0; m <= 99; m++) { inputs.push(`${h}:${String(m).padStart(2, "0")}`); inputs.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`); }
  for (const mh of [23, 47]) for (const s of inputs) {
    const a = normalizeHHMM(s, mh); const b = typedTimeOf(s, mh);
    const bv = b.kind === "ok" ? b.value : null;
    if (a !== bv) { diffs.push(`${s}@${mh}: 今=${a} 新=${bv}`); if (diffs.length > 5) break; }
  }
  check(`ti(1-11) 受ける範囲は今と同じ（${inputs.length * 2} 通りを突き合わせ・違い 0）`, diffs.length === 0, diffs.join(" / "));
}

// ── (2) N1-e 空の欄の初めの位置 ──
const shop = { shopOpen: "20:00", shopClose: "25:00" };
check("ti(2-1) 開始の欄（空）＝営業開始 20:00", timeAnchorOf({ edge: "start", ...shop }) === "20:00");
check("ti(2-2) 終了の欄（空）＝営業終了 25:00（翌01:00）", timeAnchorOf({ edge: "end", ...shop }) === "25:00");
check("ti(2-3) 呼び出し側が startAt を渡せばそれ（基本の働き方の終了＝その曜日の閉店・必要人数の終了＝帯の終わり）", timeAnchorOf({ edge: "end", startAtProp: "24:00", ...shop }) === "24:00" && timeAnchorOf({ edge: "start", startAtProp: "19:00", ...shop }) === "19:00");
check("ti(2-4) 終了の欄で店の営業終了が無ければ営業開始・どちらも無ければ null", timeAnchorOf({ edge: "end", shopOpen: "20:00", shopClose: null }) === "20:00" && timeAnchorOf({ edge: "end" }) === null);
check("ti(2-5) 開始か終了か＝edge を渡せばそれ・after を渡している欄は終了・名前に「終了」「閉店」は終了・ほかは開始",
  timeEdgeOf({ edge: "end", hasAfter: false }) === "end" && timeEdgeOf({ edge: "start", hasAfter: true }) === "start" && timeEdgeOf({ hasAfter: true }) === "end"
  && timeEdgeOf({ hasAfter: false, ariaLabel: "終了（一括）" }) === "end" && timeEdgeOf({ hasAfter: false, ariaLabel: "閉店" }) === "end" && timeEdgeOf({ hasAfter: false, ariaLabel: "開始" }) === "start" && timeEdgeOf({ hasAfter: false }) === "start");
const ti = src("components/ui/time-input.tsx");
{
  // 開いて閉じても値を書かない＝onChange を呼ぶのは pick（分）・営業開始・営業終了・決定（直接入力 2 か所）の 5 か所だけ
  const calls = (ti.match(/onChange\(/g) ?? []).length;
  const openPop = ti.slice(ti.indexOf("const openPop = () => {"), ti.indexOf("const onKey ="));
  const offEsc = ti.slice(ti.indexOf("const off = (e: MouseEvent)"), ti.indexOf("document.addEventListener(\"mousedown\", off)"));
  check("ti(2-6) 開いて閉じても値を書かない（開く・Esc・外を押すは onChange を呼ばない・onChange は 決定 系の 5 か所だけ）", calls === 5 && !openPop.includes("onChange(") && !offEsc.includes("onChange(") && offEsc.includes("setOpen(false)"), `onChange=${calls}`);
}
check("ti(2-7) 部品は空の初めの位置を timeAnchorOf で決める（after は「渡したかどうか」で見る）", ti.includes("const anchor = timeAnchorOf(") && ti.includes('Object.prototype.hasOwnProperty.call(props, "after")') && ti.includes("const startH = anchor &&"));
check("ti(2-8) 空の欄（終了・23 時まで・ラベル無し）は edge=\"end\" を渡す＝シフトの個別の上書き・シフトの枠",
  src("app/(manage)/shift/staff-shift-manage.tsx").includes('<TimeInput value={ovEnd} onChange={(v) => { setOvEnd(v); setOvNext(nextOf30h(ovStart, v)); }} maxHour={23} width={112} edge="end" />')
  && src("app/(manage)/master/staff-shift-panel.tsx").includes('<TimeInput value={fEnd} onChange={(v) => { setFEnd(v); setFNext(nextOf30h(fStart, v)); }} maxHour={23} width={112} edge="end" />'));
check("ti(2-9) ランクの出勤の時刻・時間帯料金の終了は after を渡す＝終了の欄（空のとき営業終了から）",
  src("app/(manage)/master/pricing/rank-shift-time-card.tsx").includes("after={v.start || undefined}") && src("app/(manage)/master/pricing/pricing-board.tsx").includes("<TimeInput value={mTo} onChange={(v) => setMTo(v)} maxHour={23} after={mFrom} />"));

// ── (3) N1 小窓の置き場 ──
const css = src("app/globals.css");
check("ti(3-1) 小窓は .nox-dark の直下へ portal（カード・表・モーダルの overflow に切られない）", ti.includes('import { createPortal } from "react-dom";') && ti.includes("createPortal(") && ti.includes('box.current?.closest(".nox-dark")'));
check("ti(3-2) 画面に固定＝.nox-time-pop.is-fixed は position:fixed・z 1000（シート 900 より上）", /\.nox-time-pop\.is-fixed \{ position: fixed; z-index: 1000; \}/.test(css) && ti.includes("nox-time-pop is-fixed"));
check("ti(3-3) 外を押した判定は小窓も含める（portal の中を押して閉じない）・スクロールと大きさの変化で付いていく", ti.includes("!(pop.current && pop.current.contains(tg))") && ti.includes('window.addEventListener("scroll", onScroll, true)') && ti.includes('window.addEventListener("resize", place)'));
check("ti(3-4) 置き場: 下に開く＝欄の下 +4・上に開く＝欄の上 +4（bottom）・左は画面に収める（8px）",
  JSON.stringify(timePopPlaceOf({ left: 300, top: 500, bottom: 540 }, 160, 1280, 800, false)) === JSON.stringify({ left: 300, top: 544 })
  && JSON.stringify(timePopPlaceOf({ left: 300, top: 500, bottom: 540 }, 160, 1280, 800, true)) === JSON.stringify({ left: 300, bottom: 304 })
  && timePopPlaceOf({ left: 300, top: 0, bottom: 40 }, 160, 390, 844, false).left === 222 && timePopPlaceOf({ left: -20, top: 0, bottom: 40 }, 160, 390, 844, false).left === 8);
check("ti(3-5) 受けられない値の文は共通の Message（赤）・欄は aria-invalid・旧 normalizeHHMM(typed) の黙った return は無い",
  ti.includes('{typedErr && <Message kind="error"') && ti.includes("aria-invalid={typedErr ? true : undefined}") && !ti.includes("normalizeHHMM(typed") && ti.includes("const r = typedTimeOf(typed, maxHour);"));

if (fails.length) { console.error(`✗ verify:nox-time-input 失敗 ${fails.length}（成功 ${pass}）`); for (const f of fails) console.error(" - " + f); process.exit(1); }
console.log(`verify:nox-time-input OK (${pass} checks)`);
console.log("N1 時刻の小窓は portal＋固定（カードに切られない）・N1-e 空の初めの位置は開始＝営業開始／終了＝営業終了（書かない）・N1-f 2610／930／全角を受け、断るときは理由を赤で");
