"use client";

// 席・卓マスター（DP1 P1 で master-board.tsx の view === "seat" から移設）。
//
// ★送る RPC と引数は不変: set_seat(p_id, p_store_id, p_name, p_kind, p_sort_order, p_is_active) ＝6引数。
//   p_is_active は明示 boolean（規約 原則7＝coalesce(p_x, true) の null→true リセットを避ける）。
// ★JSX・state 名・フィルタ条件・KPI の式はすべて移設前の逐語（構造変換であって挙動変更ではない）。
//   変わったのは「ハブの view state ではなく URL で開く」ことと、
//   取得が seats だけになったこと（旧 load() は products/categories/stock も同時に取っていた）。
// ★E8-5 席#5 の並べ替え（↑↓）は引き続き未実装＝set_seat 2連続呼びが非原子になるため
//   （skipped.md の記録どおり・表示順の数値入力で同じ結果が得られる）。
import { useState } from "react";
import SegSelect from "@/components/ui/seg-select";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import Modal from "@/components/ui/modal"; // ★裁定253 R1: 席の追加・編集はモーダル
import MasterPageHead from "../master-page-head";
import { swapAdjacent, reorderErrJa } from "@/lib/nox/ui/reorder"; // ★裁定255: ∧∨＝seat_reorder（全件配列・1 トランザクション）

export type Seat = { id: string; name: string; kind: string | null; sort_order: number; is_active: boolean };

const card: React.CSSProperties = t.card;
const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };
const btnDark: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
const secTitle: React.CSSProperties = t.cardTitle;

export default function SeatsBoard({ storeId, isManagerUp, initial }: {
  storeId: string; isManagerUp: boolean; initial: Seat[];
}) {
  const supabase = createClient();
  const [seats, setSeats] = useState<Seat[]>(initial);
  const [msg, setMsg] = useState<string | null>(null);

  // 席フォーム（移設前と同じ7本。sId 1つで新規/編集を兼用）
  const [sId, setSId] = useState<string | null>(null);
  const [sName, setSName] = useState("");
  const [sKind, setSKind] = useState("卓");
  const [sSort, setSSort] = useState(0);
  const [sActive, setSActive] = useState(true);
  const [seatOpen, setSeatOpen] = useState(false); // ★裁定253 R1: 席モーダルの開閉（フォーム state は従来の 5 本のまま）
  // E8-5 席#5（T2）: 席一覧の検索・種別フィルタ（client のみ・取得と編集経路は不変）
  const [seatQ, setSeatQ] = useState("");
  const [seatKind, setSeatKind] = useState("");

  async function reload() {
    const { data } = await supabase
      .from("seats").select("id, name, kind, sort_order, is_active").order("sort_order");
    setSeats((data ?? []) as Seat[]);
  }

  // ★裁定253 R2→裁定255（mig0145）: 行内の ∧∨ は swapAdjacent で全件 id 配列を作り seat_reorder を 1 回呼ぶ（1 トランザクションで 1..N 再採番＝
  //   pricing-board の moveBand と同型）。B レーンの set_seat 2 回呼び（非原子）は撤去。失敗時は reorderErrJa で表示し再読込で実態へ戻す。並びは 表示順→席名。
  const sortedSeats = seats.slice().sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "ja"));
  async function moveSeat(s: Seat, dir: -1 | 1) {
    const ids = swapAdjacent(sortedSeats.map((x) => x.id), sortedSeats.findIndex((x) => x.id === s.id), dir);
    if (!ids) return;
    setMsg(null);
    const { error } = await supabase.rpc("seat_reorder", { p_store_id: storeId, p_ids: ids });
    if (error) setMsg(`並び替えに失敗: ${reorderErrJa(error.message)}`);
    await reload();
  }

  async function saveSeat() {
    setMsg(null);
    const { error } = await supabase.rpc("set_seat", {
      p_id: sId, p_store_id: storeId, p_name: sName, p_kind: sKind, p_sort_order: sSort,
      p_is_active: sActive, // 明示 boolean（原則7）
    });
    setMsg(error ? error.message : sId ? "席を更新しました" : "席を登録しました");
    if (!error) setSeatOpen(false); // ★裁定253 R1: 保存成功で閉じる（失敗時は開いたまま）
    setSId(null); setSName("");
    await reload();
  }

  return (
    <div className="nox-mv1">
      <MasterPageHead
        eyebrow="SEAT & TABLE MASTER"
        title="席・卓"
        count={seats.length}
        unit="卓"
        desc="卓／カウンター／VIP の登録と並び順、稼働の有効切替。"
      />
      <Toast msg={msg} />

      {/* ★DP-R 第3弾（教訓26＝構造照合）: モック nox-seat-table-settings の構造へ追随。
          KPI帯4枚（カードの外）→「席一覧」カード（ツールバー＋表）→「席を編集/追加」カード（別カード）
          →「席種カテゴリ」カード。★従来は**1カードに一覧と編集フォームが同居**していた。
          ★分離は表示のみ＝state（sId/sName/sKind/sSort/sActive）も saveSeat の RPC・引数も不変。 */}
      {/* E8-5 席#2（T1）: 席 KPI 4枚＝seats state の再形のみ */}
      <div className="nox-repsum">
          <div className="nox-rs"><div className="l">総席数</div><div className="v num">{seats.length}</div></div>
          <div className="nox-rs"><div className="l">稼働可能</div><div className="v num">{seats.filter((s) => s.is_active).length}</div></div>
          <div className="nox-rs"><div className="l">無効</div><div className="v num">{seats.filter((s) => !s.is_active).length}</div></div>
        <div className="nox-rs"><div className="l">VIP</div><div className="v num">{seats.filter((s) => s.kind === "VIP").length}</div></div>
      </div>

      <section className="nox-cardtop" style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <div>
            <h2 id="m-seat" style={{ ...secTitle, margin: 0 }}>席一覧</h2>
            <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "2px 0 0" }}>行をクリックすると「席を編集」を開きます</p>
          </div>
          {isManagerUp && (
            <button style={{ ...btnDark, marginLeft: "auto" }}
              onClick={() => { setSId(null); setSName(""); setSKind("卓"); setSSort(0); setSActive(true); setSeatOpen(true); }}>＋ 席を追加</button>
          )}
        </div>
        {/* E8-5 席#5（T2）: 検索＋種別フィルタ（表示のみ） */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <input value={seatQ} onChange={(e) => setSeatQ(e.target.value)} placeholder="席名で検索"
            aria-label="席名で検索" style={{ ...input, width: 160 }} />
          <div className="nox-seg">
            {([["", "すべて"], ["卓", "卓"], ["カウンター", "カウンター"], ["VIP", "VIP"]] as const).map(([v, label]) => (
              <button key={v || "all"} className={seatKind === v ? "on" : ""} onClick={() => setSeatKind(v)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="nox-tablewrap plain">{/* ★M1 第 2 レーン（裁定251・2026-09-18）: 横スクロール容器 */}
        <table className="nox-table" style={{ marginBottom: 10 }}>
          <tbody>
            {sortedSeats.filter((s) =>
              (!seatQ.trim() || s.name.toLowerCase().includes(seatQ.trim().toLowerCase())) &&
              (seatKind === "" || s.kind === seatKind),
            ).map((s) => (
              <tr key={s.id} onClick={() => isManagerUp && (setSId(s.id), setSName(s.name), setSKind(s.kind ?? "卓"), setSSort(s.sort_order), setSActive(s.is_active), setSeatOpen(true))}
                style={{ cursor: isManagerUp ? "pointer" : "default" }}>
                <td>{s.name}</td>
                <td>{s.kind}</td>
                <td style={{ color: s.is_active ? "var(--ok)" : "var(--sub)" }}>{s.is_active ? "有効" : "無効"}</td>
                {/* ★裁定253 R2: 行内の操作列＝∧∨（244 の例外＝配置不変）。絞り込み中は全体順で入れ替える */}
                {isManagerUp && (
                  <td style={{ whiteSpace: "nowrap", textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                    <button type="button" style={{ ...btnLight, padding: "2px 8px" }} aria-label="上へ" title="表示順を上へ"
                      disabled={sortedSeats.findIndex((x) => x.id === s.id) === 0} onClick={() => void moveSeat(s, -1)}>∧</button>
                    <button type="button" style={{ ...btnLight, padding: "2px 8px", marginLeft: 4 }} aria-label="下へ" title="表示順を下へ"
                      disabled={sortedSeats.findIndex((x) => x.id === s.id) === sortedSeats.length - 1} onClick={() => void moveSeat(s, 1)}>∨</button>
                    <span style={{ fontSize: 10.5, color: "var(--v2-muted)", marginLeft: 6 }} className="num">{s.sort_order}</span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      {/* ★裁定253 R1（2026-09-14）: 「席を編集／追加」はインラインの別カードをやめ共通 Modal へ（器のみ＝項目・state・set_seat の引数は不変）。
          閉じる＝×・背景タップ・Esc。脚＝キャンセル左・登録／更新 右（244）。 */}
      {isManagerUp && seatOpen && (
        <Modal onClose={() => setSeatOpen(false)} maxWidth={430}>
          <div className="nox-formmodal-head">
            <strong>{sId ? `${sName || "席"} を編集` : "席を追加"}</strong>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span className="nox-stpill">{sId ? "編集中" : "新規"}</span>
              <button type="button" className="nox-formmodal-x" aria-label="閉じる" onClick={() => setSeatOpen(false)}>×</button>
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input placeholder="席名" value={sName} onChange={(e) => setSName(e.target.value)} style={{ ...input, width: 140 }} />
            <SegSelect value={sKind} onChange={(v) => setSKind(v)}
            options={[["卓", "卓"], ["カウンター", "カウンター"], ["VIP", "VIP"]] as const} />
            <label style={{ fontSize: 12 }}>表示順 <input type="number" min={0} value={sSort} onChange={(e) => setSSort(Number(e.target.value))} style={{ ...input, width: 56 }} /></label>
            {/* 段G: 既存 boolean(is_active) のトグルを canonical スイッチ表示へ（状態・挙動は不変） */}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12 }}>
              <button type="button" className={`nox-switch ${sActive ? "on" : ""}`} onClick={() => setSActive(!sActive)} aria-pressed={sActive} aria-label="有効"><i /></button>
              有効
            </span>
          </div>
          <p style={{ fontSize: 10.5, color: "var(--v2-muted)", margin: "8px 0 0", lineHeight: 1.7 }}>
            表示順はレジのフロア表示に使われます。「有効」を外した席は開卓できなくなります（過去の伝票は残ります）。
          </p>
          <div className="nox-formmodal-foot">
            <button style={btnLight} onClick={() => setSeatOpen(false)}>キャンセル</button>
            <button style={btnDark} onClick={() => void saveSeat()}>{sId ? "更新" : "登録"}</button>
          </div>
        </Modal>
      )}

      {/* 席種カテゴリ（モックに在るが実体なし＝seats.kind は 卓/カウンター/VIP の固定3種で
          カテゴリを持つテーブルが無い＝器を置いて準備中。教訓25＝押しても何も起きないものを作らない） */}
      <section className="nox-cardtop" style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          <div>
            <h2 style={{ ...secTitle, margin: 0 }}>席種カテゴリ</h2>
            <p style={{ fontSize: 11, color: "var(--v2-muted)", margin: "2px 0 0" }}>席種ごとの表示名・並び順の管理</p>
          </div>
          <span className="nox-stpill" style={{ marginLeft: "auto" }}>準備中</span>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--v2-muted)", margin: 0, lineHeight: 1.8 }}>
          席種は <b>卓 / カウンター / VIP</b> の3種で固定です（追加・改名は準備中）。
          時間帯料金の席種条件もこの3種を使います。
        </p>
      </section>
    </div>
  );
}
