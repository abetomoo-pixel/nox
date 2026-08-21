"use client";

// お知らせ・連絡ボード（F3e・mig0034）。RLS が可視範囲を物理保証（store_id=auth_store_id()・
// cast は all/cast のみ）＝client 側フィルタ不要。投稿/編集/削除は owner/manager のみ（notice_* RPC が
// 真の防御・UI でも isManagerUp で出し分け）。期限切れ（until<営業日）は削除も raise もせず「期限切れ」
// バッジのみ（0034 設計ロック＝DB は保持・表示側判定）。編集は全フィールド明示送信（規約7）。
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { bizDateOf, addDays } from "@/lib/nox/biz-date";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import Modal from "@/components/ui/modal";

type Notice = {
  id: string; title: string; body: string; audience: string;
  pinned: boolean; until: string | null; created_at: string;
};

const AUD_LABEL: Record<string, string> = { all: "全員", cast: "キャスト", staff: "黒服" };
const AUD_OPTIONS: Array<[string, string]> = [["all", "全員"], ["cast", "キャスト"], ["staff", "黒服"]];
// 掲載期限セグメント（モックの日数セグメント 0/1/3/7 に対応・0=期限なし）
const UNTIL_SEG: Array<[number, string]> = [[0, "期限なし"], [1, "当日"], [3, "3日"], [7, "7日"]];

// ★DP3 P1（2026-08-21・裁定 DP3-①）: 入力欄の上限（RPC 側の 'bad title' / 'bad body' と同値）。
//   モックの本文カウンタは 1000 だが、**NOX の実装上限 4000 を正**とする（RPC が 4000 で弾く）。
const TITLE_MAX = 80;
const BODY_MAX = 4000;

// ★DP3 P1: 定型文（モック `templateSelect` の3種に対応）。
//   ★**定数のみ**＝DB に列を足さない（E8 `notices#3` の注記「テンプレートは定数で足りるが、
//     カテゴリ保持には列追加が要る」に従い、**カテゴリとは分離**してテンプレートだけ入れる）。
//   ★選ぶと件名・本文を**フォームに流し込むだけ**＝送る RPC も引数も変わらない。
const TEMPLATES: Array<{ key: string; label: string; title: string; body: string }> = [
  {
    key: "shift", label: "シフト提出のお願い",
    title: "シフト提出のお願い",
    body: "来月のシフト希望の提出をお願いします。\n締切までにマイページの「希望」から入力してください。\n締切後の変更は個別にご相談ください。",
  },
  {
    key: "meeting", label: "ミーティング案内",
    title: "全体ミーティングのご案内",
    body: "全体ミーティングを行います。\n日時：\n場所：\n議題：\n出勤前の時間に実施しますので、遅れないようお願いします。",
  },
  {
    key: "payroll", label: "給与明細の公開",
    title: "給与明細を公開しました",
    body: "今月分の給与明細を公開しました。\nマイページからご確認ください。\n内容についてご不明な点があれば店長までお願いします。",
  },
];

// ★DP-R 第2弾（教訓26 の構造照合・相談役裁定「器を全構築・LINE 実送信のみ無効化・
//   データ源なき数値は — か 準備中」）。モック nox-announcement-management の構造へ追随する。
//
// ★実体の境界（notices は mig0034 の1テーブル＝id/org_id/store_id/title/body/audience/pinned/until/
//   created_by/created_at のみ。status も category も配信ログも既読も無い）:
//     - 実データで動く: 件名・本文・公開範囲(audience)・ピン(pinned)・掲載期限(until)・定型文(client 定数)
//     - **器だけ置いて操作させない**（列が無い＝押しても保存されないため disabled＋「準備中」）:
//       カテゴリ／通知方法（LINE・メール）／配信タイミング（今すぐ・予約・下書き）／確認回答を求める
//     - **数値は「—」**（データ源が無い）: LINE連携・平均既読率・未連携・既読・確認済み
//   ★この扱いは教訓25（実体のない段を描かない）と矛盾しない: 段（状態遷移）は作らず、
//     器（置き場）だけをモックの位置に置き、**準備中と明記して押せなくする**＝
//     「押しても何も起きない」を作らない。実装が入ったら disabled を外す1箇所で開通する。
const SOON = "準備中";
// モックのカテゴリ5種（notices に category 列が無い＝表示のみ・選ばせない）
const CATEGORIES = ["店舗連絡", "シフト", "給与", "緊急", "システム"];

// RPC エラーの日本語化（notices 系）
function rpcErrJa(msg: string | undefined): string {
  if (!msg) return "不明なエラー";
  if (msg.includes("bad title")) return "件名を入力してください（80字以内）";
  if (msg.includes("bad body")) return "本文を入力してください（4000字以内）";
  if (msg.includes("bad audience")) return "公開範囲の指定が不正です";
  if (msg.includes("bad pinned")) return "ピン設定が不正です";
  if (msg.includes("forbidden")) return "権限がありません";
  return msg;
}

// 段0R 第3陣: 器は共通クラス nox-panel・見出しは nox-panel > h3（白）へ統一＝card/secTitle は撤去。
const input: React.CSSProperties = { ...t.input, fontSize: 13 };
const btnDark: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const chkLabel: React.CSSProperties = { ...t.fieldLabel, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" };

// ★DP3 P1補（裁定 DP3-⑤）: 宛先の人数（server で件数だけ取得＝page.tsx）。
//   null は「数えられなかった」＝画面では「—」に落とす（嘘の 0 を出さない）。
export type AudienceCounts = { cast: number | null; staff: number | null };

export default function NoticesBoard({ isManagerUp, audienceCounts, storeName }: {
  isManagerUp: boolean;
  audienceCounts: AudienceCounts;
  storeName?: string | null;
}) {
  const supabase = createClient();
  const bizToday = bizDateOf(new Date().toISOString(), "06:00");
  const [rows, setRows] = useState<Notice[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // ★DP-R: 掲載前の確認モーダル（モック publishConfirm）。送る RPC・引数は不変＝一段挟むだけ。
  const [confirmOpen, setConfirmOpen] = useState(false);
  // ★DP-R: 一覧の公開範囲フィルタ（""=すべて）。取得済み rows の client 絞り込みのみ。
  const [audFilter, setAudFilter] = useState("");
  // 投稿フォーム
  const [fTitle, setFTitle] = useState("");
  const [fBody, setFBody] = useState("");
  const [fAud, setFAud] = useState("all");
  const [fPinned, setFPinned] = useState(false);
  const [fUntilSeg, setFUntilSeg] = useState(0);
  // 編集（inline・until は date 入力で任意値を保持）
  // ★DP3 P1（裁定 DP3-①・E8 notices#8）: 一覧の検索。**client フィルタのみ**＝取得は不変。
  const [q, setQ] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [eTitle, setETitle] = useState("");
  const [eBody, setEBody] = useState("");
  const [eAud, setEAud] = useState("all");
  const [ePinned, setEPinned] = useState(false);
  const [eUntil, setEUntil] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("notices")
      .select("id, title, body, audience, pinned, until, created_at")
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });
    setRows((data ?? []) as Notice[]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { void load(); }, [load]);

  const untilFromSeg = (seg: number): string | null => (seg === 0 ? null : addDays(bizToday, seg));

  async function post() {
    setMsg(null); setBusy(true);
    const { error } = await supabase.rpc("notice_create", {
      p_title: fTitle, p_body: fBody, p_audience: fAud, p_pinned: fPinned, p_until: untilFromSeg(fUntilSeg),
    });
    setBusy(false);
    if (error) { setMsg(`投稿に失敗: ${rpcErrJa(error.message)}`); return; }
    setMsg("お知らせを投稿しました");
    setFTitle(""); setFBody(""); setFAud("all"); setFPinned(false); setFUntilSeg(0);
    await load();
  }

  function startEdit(n: Notice) {
    setEditId(n.id); setETitle(n.title); setEBody(n.body); setEAud(n.audience);
    setEPinned(n.pinned); setEUntil(n.until ?? ""); setMsg(null);
  }

  async function saveEdit() {
    if (!editId) return;
    setMsg(null); setBusy(true);
    // 規約7: 全フィールド明示送信（pinned は明示 boolean・until は空=null）
    const { error } = await supabase.rpc("notice_update", {
      p_notice_id: editId, p_title: eTitle, p_body: eBody, p_audience: eAud,
      p_pinned: ePinned, p_until: eUntil || null,
    });
    setBusy(false);
    if (error) { setMsg(`変更に失敗: ${rpcErrJa(error.message)}`); return; }
    setMsg("お知らせを変更しました");
    setEditId(null);
    await load();
  }

  async function del(n: Notice) {
    if (!window.confirm(`「${n.title}」を削除しますか？`)) return;
    setMsg(null); setBusy(true);
    const { error } = await supabase.rpc("notice_delete", { p_notice_id: n.id });
    setBusy(false);
    if (error) { setMsg(`削除に失敗: ${rpcErrJa(error.message)}`); return; }
    setMsg("削除しました");
    await load();
  }

  const when = (iso: string) =>
    new Date(iso).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" });
  const isExpired = (n: Notice) => !!n.until && n.until < bizToday;

  // ★DP3 P1: 検索（件名・本文の部分一致・大文字小文字を無視）。**取得済み rows の絞り込みだけ**。
  const needle = q.trim().toLowerCase();
  const shown = rows
    .filter((n) => audFilter === "" || n.audience === audFilter)
    .filter((n) => needle === "" || n.title.toLowerCase().includes(needle) || n.body.toLowerCase().includes(needle));

  // ★DP3 P1（E8 notices#1 の LINE 非依存な1枚だけ）: 「今月の配信」KPI。
  //   ★**新規取得ゼロ**＝取得済み rows の created_at を JST の年月で数え直すだけ。
  //   ★NOX の「配信」は掲示＝投稿のこと（LINE 送信の実績は持たない＝T3）。文言もそう書く。
  //   ★モックの他3枚（LINE連携／平均既読率／未連携）は**出さない**＝実績データが無い（発明しない原則）。
  const ymOf = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 7);
  const thisYm = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 7);
  const prevYm = (() => {
    const [y, m] = thisYm.split("-").map(Number);
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  })();
  const postedThis = rows.filter((n) => ymOf(n.created_at) === thisYm).length;
  const postedPrev = rows.filter((n) => ymOf(n.created_at) === prevYm).length;

  // ★DP3 P1補（裁定 DP3-⑤）: 宛先ごとの人数（モックの配信対象カードに対応）。
  //   ★`all` は cast＋黒服の和＝「この店に在籍している人」。どちらかが数えられなければ和も出さない。
  //   ★数の意味は **宛先**であって「見える人」ではない。notices の RLS は
  //     `auth_role() <> 'cast' or audience in ('all','cast')`＝**オーナー・店長は宛先に関わらず全件見える**。
  //     その但し書きは画面にも出す（数だけ見せて誤解させない）。
  const cntCast = audienceCounts.cast;
  const cntStaff = audienceCounts.staff;
  const cntAll = cntCast != null && cntStaff != null ? cntCast + cntStaff : null;
  const audCount: Record<string, number | null> = { all: cntAll, cast: cntCast, staff: cntStaff };
  const nOr = (v: number | null) => (v == null ? "—" : String(v));

  return (
    // ★R3 第1弾: タイポ・余白のモック実値写し（.nox-mv1）。お知らせは announcement 実測が
    //   一回り小さい設計のため .nox-mv1-sm を併用する。
    <div className="nox-mv1 nox-mv1-sm">
      {/* 段0R 第3陣: ヘッダを新シェルの nox-hero へ（他画面と同基準・表示のみ） */}
      <div className="nox-hero">
        <div>
          <h1 style={{ fontSize: 28, margin: "0 0 8px", fontWeight: 700 }}>お知らせ</h1>
          <p style={{ margin: 0, color: "var(--sub)", fontSize: 14 }}>
            店舗の連絡ボード（{isManagerUp ? "投稿・編集可" : "閲覧のみ"}）
          </p>
        </div>
      </div>
      <Toast msg={msg} />

      {/* ★DP-R: モック冒頭の案内帯（LINE を基本に配信・連携管理への導線）。
          LINE 連携そのものが未実装＝ボタンは押せない状態で置く（準備中と明記）。 */}
      <div className="nox-alert" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <span>
          お知らせはこの画面に掲載され、スタッフ・キャストのマイページに表示されます。
          <b>LINE 通知とメール送信は{SOON}です</b>（掲載は今すぐ使えます）。
        </span>
        <button style={{ ...btnLight, opacity: 0.45 }} disabled title={`LINE 連携は${SOON}です`}>LINE連携を管理</button>
      </div>

      {/* ★DP-R: KPI 帯4枚＝モック逐語の並び（LINE連携／今月の配信／平均既読率／未連携）。
          出せるのは「今月の配信」だけ＝**残り3枚は「—」＋準備中**で置く（器は作るが数字は作らない）。 */}
      <div className="nox-kpirow">
        <div className="nox-kpi2">
          <div className="nox-kpi2-l">LINE連携</div>
          <div className="nox-kpi2-v num">—</div>
          <div className="nox-kpi2-s">{SOON}</div>
        </div>
        <div className="nox-kpi2">
          <div className="nox-kpi2-l">今月の配信</div>
          <div className="nox-kpi2-v num">{postedThis}<small>件</small></div>
          <div className="nox-kpi2-s">前月 {postedPrev}件</div>
        </div>
        <div className="nox-kpi2">
          <div className="nox-kpi2-l">平均既読率</div>
          <div className="nox-kpi2-v num">—</div>
          <div className="nox-kpi2-s">{SOON}</div>
        </div>
        <div className="nox-kpi2">
          <div className="nox-kpi2-l">未連携</div>
          <div className="nox-kpi2-v num">—</div>
          <div className="nox-kpi2-s">{SOON}</div>
        </div>
      </div>

      {/* ★DP-R: モック .workspace ＝ 左「お知らせを作成」／右「LINEプレビュー＋よく使うテンプレート」の
          2カラム（minmax(620px,1.35fr) minmax(310px,.65fr) ≒ 既存 .nox-2col。新クラスは作らない）。 */}
      {isManagerUp && (
      <div className="nox-2col">
        <section className="nox-panel">
          <h3>お知らせを作成</h3>
          <p style={{ fontSize: 11.5, color: "var(--v2-muted)", margin: "-4px 0 10px" }}>
            配信前に対象とプレビューを確認できます。
          </p>
          {/* カテゴリ＝モックに在るが notices に列が無い＝選ばせない（準備中） */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
            <span style={t.fieldLabel}>カテゴリ</span>
            <span className="nox-chip" style={{ opacity: 0.5 }}>{SOON}</span>
            {CATEGORIES.map((c) => (
              <span key={c} className="nox-chip" style={{ opacity: 0.35 }}>{c}</span>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* ★DP3 P1: 定型文（定数のみ・選ぶと件名/本文を流し込むだけ＝RPC も引数も不変） */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={t.fieldLabel}>定型文</span>
              <select
                value=""
                onChange={(e) => {
                  const tpl = TEMPLATES.find((x) => x.key === e.target.value);
                  if (tpl) { setFTitle(tpl.title); setFBody(tpl.body); }
                }}
                style={{ ...input, width: "auto" }}
              >
                <option value="">使用しない</option>
                {TEMPLATES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
              </select>
              <span style={{ fontSize: 11, color: "var(--v2-muted)" }}>選ぶと件名・本文に下書きが入ります（そのまま編集できます）</span>
            </div>
            {/* ★DP3 P1（E8 notices#9）: 文字数カウンタ。maxLength は従来どおり残す＝上限で切る挙動は不変 */}
            <label style={{ ...t.fieldLabel, display: "flex", justifyContent: "space-between" }}>
              <span>件名</span>
              <span className="num" style={{ color: fTitle.length >= TITLE_MAX ? "var(--bad)" : "var(--v2-muted)" }}>
                {fTitle.length} / {TITLE_MAX}
              </span>
            </label>
            <input value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="件名（80字まで）" maxLength={TITLE_MAX} style={input} />
            <label style={{ ...t.fieldLabel, display: "flex", justifyContent: "space-between" }}>
              <span>本文</span>
              <span className="num" style={{ color: fBody.length >= BODY_MAX ? "var(--bad)" : "var(--v2-muted)" }}>
                {fBody.length} / {BODY_MAX}
              </span>
            </label>
            <textarea value={fBody} onChange={(e) => setFBody(e.target.value)} placeholder="本文（4000字まで）" maxLength={BODY_MAX} rows={3}
              style={{ ...input, resize: "vertical", fontFamily: "inherit" }} />
            {/* ★DP3 P1補（裁定 DP3-⑤）: 公開範囲を**モック準拠のカード**へ（人数つき）。
                ★select → ボタン3枚に変えただけで、持つ値（all/cast/staff）も state も送る引数も不変。
                ★人数は server が数えた件数（page.tsx・is_active のみ）。数えられなければ「—」。 */}
            <div>
              <span style={t.fieldLabel}>公開範囲</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 6 }}>
                {AUD_OPTIONS.map(([v, l]) => {
                  const on = fAud === v;
                  return (
                    <button
                      key={v} type="button" aria-pressed={on} onClick={() => setFAud(v)}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2,
                        padding: "9px 11px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit",
                        textAlign: "left",
                        background: on ? "var(--goldface2)" : "var(--card2)",
                        border: on ? "1px solid var(--gold)" : "1px solid var(--line)",
                        color: on ? "var(--champ)" : "var(--ink)",
                      }}
                    >
                      <span className="num" style={{ fontSize: 17, fontWeight: 800 }}>
                        {nOr(audCount[v] ?? null)}<small style={{ fontSize: 11, fontWeight: 400, marginLeft: 2 }}>名</small>
                      </span>
                      <span style={{ fontSize: 12.5, fontWeight: 700 }}>{l}</span>
                      <span style={{ fontSize: 10.5, color: "var(--v2-muted)" }}>
                        {v === "all" ? `キャスト${nOr(cntCast)}・黒服${nOr(cntStaff)}`
                          : v === "cast" ? "在籍キャスト"
                          : "キャストには表示されません"}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p style={{ fontSize: 10.5, color: "var(--v2-muted)", margin: "6px 0 0", lineHeight: 1.7 }}>
                人数は在籍している人の数です（退店済み・無効の担当は数えません）。
                オーナー・店長は公開範囲にかかわらずすべてのお知らせを閲覧できます。
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <label style={chkLabel}>
                <input type="checkbox" checked={fPinned} onChange={(e) => setFPinned(e.target.checked)} />ピン留め
              </label>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={t.fieldLabel}>掲載期限</span>
              {UNTIL_SEG.map(([v, l]) => (
                <button key={v} style={v === fUntilSeg ? btnDark : btnLight} onClick={() => setFUntilSeg(v)}>{l}</button>
              ))}
            </div>
            {/* ★DP-R: 通知方法（モック .methods）＝LINE/メールとも実装が無い＝チェックできない状態で置く。
                「お知らせ一覧の先頭に固定」だけは pinned 列があるので**上のピン留めが実体**＝ここには重ねない。 */}
            <div>
              <span style={t.fieldLabel}>通知方法</span>
              <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                <label style={{ ...chkLabel, opacity: 0.5, cursor: "not-allowed" }}>
                  <input type="checkbox" checked={false} disabled readOnly />
                  LINE通知を送る<span style={{ fontSize: 10.5, color: "var(--v2-muted)", marginLeft: 6 }}>（{SOON}）</span>
                </label>
                <label style={{ ...chkLabel, opacity: 0.5, cursor: "not-allowed" }}>
                  <input type="checkbox" checked={false} disabled readOnly />
                  スタッフへメールも送信<span style={{ fontSize: 10.5, color: "var(--v2-muted)", marginLeft: 6 }}>（{SOON}）</span>
                </label>
                <label style={{ ...chkLabel, opacity: 0.5, cursor: "not-allowed" }}>
                  <input type="checkbox" checked={false} disabled readOnly />
                  「確認しました」の回答を求める<span style={{ fontSize: 10.5, color: "var(--v2-muted)", marginLeft: 6 }}>（{SOON}）</span>
                </label>
              </div>
            </div>
            {/* ★DP-R: 配信タイミング（モック .timing）＝notices に status も配信予約も無い。
                実体があるのは「今すぐ掲載」だけ＝それだけを選択済み固定で見せ、他は押せない。 */}
            <div>
              <span style={t.fieldLabel}>掲載タイミング</span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                <button type="button" style={btnDark} aria-pressed>今すぐ掲載</button>
                <button type="button" style={{ ...btnLight, opacity: 0.45 }} disabled title={`予約掲載は${SOON}です`}>日時を予約（{SOON}）</button>
                <button type="button" style={{ ...btnLight, opacity: 0.45 }} disabled title={`下書き保存は${SOON}です`}>下書き保存（{SOON}）</button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {/* ★投稿は**確認モーダルを挟む**（モック `publishConfirm`）＝送る RPC・引数は不変 */}
              <button style={{ ...btnDark, opacity: busy ? 0.6 : 1 }} disabled={busy}
                onClick={() => { if (!fTitle.trim() || !fBody.trim()) { setMsg("件名と本文を入力してください"); return; } setConfirmOpen(true); }}>
                内容を確認して掲載
              </button>
              <button style={btnLight} onClick={() => { setFTitle(""); setFBody(""); }}>入力をクリア</button>
            </div>
          </div>
        </section>

        {/* 右カラム＝LINEプレビュー＋よく使うテンプレート（モック .workspace の右） */}
        <div style={{ display: "grid", gap: 14 }}>
          <section className="nox-panel">
            <h3>LINEプレビュー</h3>
            <p style={{ fontSize: 11.5, color: "var(--v2-muted)", margin: "-4px 0 10px" }}>
              受信者に表示されるイメージです。<b>実際の送信は{SOON}</b>＝この画面から LINE は送られません。
            </p>
            {/* モック .bubble（白背景の吹き出し）＝配色は固定値でよい＝LINE 画面の再現だから */}
            <div style={{ background: "#0d0d0c", border: "1px solid var(--line)", borderRadius: 10, padding: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--goldface2)",
                  color: "var(--champ)", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 800 }}>N</span>
                <b style={{ fontSize: 11.5 }}>{storeName ?? "店舗"}</b>
              </div>
              <div style={{ background: "#fff", color: "#242424", borderRadius: "4px 12px 12px 12px",
                padding: 11, fontSize: 11.5, lineHeight: 1.75, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                <b>{fTitle.trim() || "お知らせの件名"}</b>
                <br />
                {fBody.trim() || "本文を入力すると、ここに通知の見え方が表示されます。"}
              </div>
              <p style={{ fontSize: 10, color: "var(--v2-muted)", margin: "8px 0 0", lineHeight: 1.7 }}>
                公開範囲「{AUD_LABEL[fAud] ?? fAud}」に掲載されます。
                {fAud === "staff" ? "キャストには表示されません。" : ""}
              </p>
            </div>
          </section>

          <section className="nox-panel">
            <h3>よく使うテンプレート</h3>
            <p style={{ fontSize: 11.5, color: "var(--v2-muted)", margin: "-4px 0 8px" }}>押すと件名・本文に下書きが入ります。</p>
            {TEMPLATES.map((x) => (
              <button key={x.key} type="button" className="nox-listrow"
                style={{ width: "100%", textAlign: "left", cursor: "pointer", background: "transparent",
                  border: 0, borderBottom: "1px solid var(--line)", fontFamily: "inherit", color: "var(--ink)" }}
                onClick={() => { setFTitle(x.title); setFBody(x.body); }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: 12.5 }}>{x.label}</b>
                  <span style={{ display: "block", fontSize: 10.5, color: "var(--v2-muted)" }}>{x.title}</span>
                </span>
              </button>
            ))}
          </section>
        </div>
      </div>
      )}

      <section className="nox-panel">
        <h3>お知らせ一覧</h3>
        <p style={{ fontSize: 11.5, color: "var(--v2-muted)", margin: "-4px 0 10px" }}>
          掲載中のお知らせ。既読・確認回答の追跡は{SOON}です。
        </p>
        {/* ★DP3 P1（E8 notices#8）: 検索＝取得済み rows の client フィルタのみ（取得も RLS も不変）。
            ★DP-R: モックのフィルタは「すべて／配信済み／予約／下書き」だが notices に status が無い＝
              **同じ位置に実体のある軸（公開範囲）を置く**（教訓25＝無い状態を UI で作らない）。 */}
        <div className="nox-ctoolbar" style={{ marginBottom: 10 }}>
          <div className="nox-seg">
            {([["", "すべて"], ...AUD_OPTIONS] as Array<[string, string]>).map(([v, l]) => (
              <button key={v || "all-f"} className={audFilter === v ? "on" : ""} onClick={() => setAudFilter(v)}>{l}</button>
            ))}
          </div>
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="件名・本文で検索" aria-label="お知らせを検索"
            style={{ ...input, width: 220 }}
          />
          {(needle !== "" || audFilter !== "") && (
            <span style={{ fontSize: 12, color: "var(--v2-muted)" }}>
              <span className="num">{shown.length}</span> / {rows.length} 件
            </span>
          )}
        </div>
        {rows.length === 0 && <p style={{ fontSize: 13, color: "var(--v2-muted)" }}>お知らせはありません。</p>}
        {rows.length > 0 && shown.length === 0 && (
          <p style={{ fontSize: 13, color: "var(--v2-muted)" }}>「{q.trim()}」に一致するお知らせはありません。</p>
        )}
        {shown.map((n) => editId === n.id ? (
          <div key={n.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 8 }}>
            {/* ★DP3 P1: 編集側にも同じカウンタ（投稿と同じ規約で見せる） */}
            <label style={{ ...t.fieldLabel, display: "flex", justifyContent: "space-between" }}>
              <span>件名</span>
              <span className="num" style={{ color: eTitle.length >= TITLE_MAX ? "var(--bad)" : "var(--v2-muted)" }}>
                {eTitle.length} / {TITLE_MAX}
              </span>
            </label>
            <input value={eTitle} onChange={(e) => setETitle(e.target.value)} maxLength={TITLE_MAX} style={input} />
            <label style={{ ...t.fieldLabel, display: "flex", justifyContent: "space-between" }}>
              <span>本文</span>
              <span className="num" style={{ color: eBody.length >= BODY_MAX ? "var(--bad)" : "var(--v2-muted)" }}>
                {eBody.length} / {BODY_MAX}
              </span>
            </label>
            <textarea value={eBody} onChange={(e) => setEBody(e.target.value)} maxLength={BODY_MAX} rows={3}
              style={{ ...input, resize: "vertical", fontFamily: "inherit" }} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select value={eAud} onChange={(e) => setEAud(e.target.value)} style={{ ...input, width: "auto" }}>
                {AUD_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <label style={chkLabel}>
                <input type="checkbox" checked={ePinned} onChange={(e) => setEPinned(e.target.checked)} />ピン留め
              </label>
              <span style={t.fieldLabel}>掲載期限</span>
              <input type="date" value={eUntil} onChange={(e) => setEUntil(e.target.value)} style={{ ...input, width: "auto" }} />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={{ ...btnDark, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={saveEdit}>保存</button>
              <button style={btnLight} onClick={() => setEditId(null)}>キャンセル</button>
            </div>
          </div>
        ) : (
          /* 段L2: 一覧行のリッチ化（モック .nrow/.nhead/.aud/.nbody）。
             ★出す情報は現行と完全に同一（ピン・件名・公開範囲・期限切れ・投稿日時・本文・掲載期限・編集/削除）。
             audience の出し分けは RLS と RPC が担い、ここは表示だけ＝機能不変。 */
          <div key={n.id} className="nox-nrow">
            <div className="nox-nhead">
              {n.pinned && <span className="nox-aud" style={{ borderColor: "var(--gold)", color: "var(--gold)", fontWeight: 700 }}>ピン</span>}
              <span className="t">{n.title}</span>
              <span className="nox-aud">{AUD_LABEL[n.audience] ?? n.audience}</span>
              {isExpired(n) && <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--bad)" }}>期限切れ</span>}
              <span className="when num">{when(n.created_at)}</span>
            </div>
            <p className="nox-nbody">{n.body}</p>
            {n.until && <p className="num" style={{ fontSize: 11, color: "var(--v2-muted)", margin: "3px 0 0" }}>掲載期限 {n.until}</p>}
            {/* ★DP-R: モック一覧行の「既読 10/10名・確認済み 9/10名」＝**既読ログが無い**（notices 1テーブルのみ）。
                器だけ同じ位置に置き、値は「—」＝数字を作らない。 */}
            <p style={{ fontSize: 10.5, color: "var(--v2-muted)", margin: "3px 0 0" }}>
              既読 <span className="num">—</span> ・ 確認済み <span className="num">—</span>
              <span style={{ marginLeft: 6 }}>（{SOON}）</span>
            </p>
            {isManagerUp && (
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button style={btnLight} onClick={() => startEdit(n)}>編集</button>
                <button style={btnLight} onClick={() => void del(n)}>削除</button>
              </div>
            )}
          </div>
        ))}
      </section>

      {/* ★DP-R: 掲載の確認（モック publishConfirm）。ここで初めて notice_create を呼ぶ＝
          送る RPC・引数・バリデーションは DP3 のまま1文字も変えていない（一段挟むだけ）。 */}
      {confirmOpen && (
        <Modal onClose={() => setConfirmOpen(false)}>
          <div className="nox-modalhead">
            <h3 id="notice-confirm-h" style={{ margin: 0, fontSize: 16 }}>お知らせの掲載確認</h3>
          </div>
          <div className="nox-modalbody">
            <div className="nox-listrow"><span style={{ flex: 1 }}>公開範囲</span>
              <b>{AUD_LABEL[fAud] ?? fAud}<span className="num" style={{ marginLeft: 6 }}>{nOr(audCount[fAud] ?? null)}名</span></b></div>
            <div className="nox-listrow"><span style={{ flex: 1 }}>掲載タイミング</span><b>今すぐ</b></div>
            <div className="nox-listrow"><span style={{ flex: 1 }}>掲載期限</span>
              <b className="num">{fUntilSeg === 0 ? "期限なし" : addDays(bizToday, fUntilSeg)}</b></div>
            <div className="nox-listrow"><span style={{ flex: 1 }}>ピン留め</span><b>{fPinned ? "する" : "しない"}</b></div>
            <div className="nox-listrow" style={{ opacity: 0.6 }}>
              <span style={{ flex: 1 }}>LINE通知 / メール</span><b>{SOON}（送信しません）</b>
            </div>
            <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "8px 0 0", lineHeight: 1.7 }}>
              掲載すると、対象のマイページとこの一覧に表示されます。オーナー・店長は公開範囲にかかわらず閲覧できます。
            </p>
          </div>
          <div className="nox-modalfoot">
            <button style={btnLight} onClick={() => setConfirmOpen(false)}>戻る</button>
            <button style={{ ...btnDark, opacity: busy ? 0.6 : 1 }} disabled={busy}
              onClick={async () => { setConfirmOpen(false); await post(); }}>この内容で掲載</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
