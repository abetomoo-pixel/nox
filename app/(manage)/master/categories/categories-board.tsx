"use client";

// 商品カテゴリ（マスタIA再編 レーン③で移設 → レーン④c で商品と同じ型へ）。
// ★JSX は作り直したが、送る RPC と引数は不変:
//     set_product_category(p_id, p_store_id, p_name, p_sort_order, p_is_active)  ＝5引数
//     product_category_reorder(p_store_id, p_ids)                                ＝mig0077
// ★並び替えは mig0077 の配列一括 RPC のみ（set_product_category の2回呼びはしない＝
//   name/is_active を再送して他端末の編集を巻き戻す形を作らない）。
// ★RPC は件数一致を両方向で検証する（①全 id が同 org/store に実在 ②同 org/store の全行が配列に含まれる）。
//   よって送る配列は常に「この店の全カテゴリ」。部分配列は 'partial ids' で落ちる。
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import Modal from "@/components/ui/modal";
import MasterPageHead from "../master-page-head";
import {
  fetchProducts, fetchProductCategories,
  type MasterProduct as Product, type MasterCategory as Category,
} from "@/lib/nox/master/queries";

const card: React.CSSProperties = t.card;
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
// ★④c: 商品モーダルと同じ寸法。theme.ts へ引き上げ済み（複製しない）。
const { inputLg, btnPrimaryLg } = t;

export type CategoriesInitial = { categories: Category[]; products: Product[] };

export default function CategoriesBoard({ storeId, isManagerUp, initial }: {
  storeId: string; isManagerUp: boolean; initial: CategoriesInitial;
}) {
  const supabase = createClient();
  const [categories, setCategories] = useState<Category[]>(initial.categories);
  const [products, setProducts] = useState<Product[]>(initial.products);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // カテゴリ管理フォーム（set_product_category）。cId 1つで新規/編集を兼用＝商品と同じ流儀。
  const [modalOpen, setModalOpen] = useState(false);
  const [cId, setCId] = useState<string | null>(null);
  const [cCatName, setCCatName] = useState("");
  const [cActive, setCActive] = useState(true);
  // ★並び順は UI から撤去した（reorder が 1..N へ正規化するので手入力の意味が消える）。
  //   ただし set_product_category は p_sort_order を必須で要求するため、値は内部で保持する:
  //     編集時 = その行の現在値（据え置き＝並びを動かさない）
  //     新規時 = 現在の最大値 + 1（末尾に付く）
  const [cSort, setCSort] = useState(0);

  async function reload() {
    const [cats, ps] = await Promise.all([fetchProductCategories(supabase), fetchProducts(supabase)]);
    setCategories(cats);
    setProducts(ps);
  }

  // 表示順＝取得順（sort_order → name）。∧∨ はこの並びの隣接2件を入れ替える。
  const ordered = categories;

  function openNew() {
    setCId(null);
    setCCatName("");
    setCActive(true);
    // ★末尾に付ける。reorder 未実施の店では 8/10/20/… のような手入力値が残っているため max+1 とする
    //   （0 固定だと先頭に割り込む）。並びを整えたいときは ∧∨ で 1..N へ正規化される。
    setCSort(ordered.reduce((mx, c) => Math.max(mx, c.sort_order), 0) + 1);
    setModalOpen(true);
  }

  function openEdit(c: Category) {
    setCId(c.id);
    setCCatName(c.name);
    setCActive(c.is_active);
    setCSort(c.sort_order); // 据え置き＝編集で並びを動かさない
    setModalOpen(true);
  }

  // 純増⑦（mig0063）: カテゴリ upsert（set_product_category・owner/manager 自店＝RPC 側も二重で拒否）
  async function saveCategory() {
    if (!cCatName.trim()) return;
    setMsg(null);
    setBusy(true);
    const { error } = await supabase.rpc("set_product_category", {
      p_id: cId, p_store_id: storeId, p_name: cCatName.trim(), p_sort_order: cSort,
      p_is_active: cActive, // 明示 boolean（原則7）
    });
    setBusy(false);
    setMsg(error
      ? (error.message.includes("duplicate name") ? "同じ名前のカテゴリが既にあります"
        : error.message.includes("bad name") ? "カテゴリ名は40字以内で入力してください"
        : error.message.includes("forbidden") ? "権限がありません"
        : error.message)
      : cId ? "カテゴリを更新しました" : "カテゴリを登録しました");
    if (!error) { setModalOpen(false); setCId(null); setCCatName(""); setCActive(true); }
    await reload();
  }

  // ★④c（裁定G）: 隣接入れ替え。押した瞬間に投げる（確定ボタンなし・楽観更新なし）。
  //   渡すのは常に全件の id を並べ替え後の順で。成功後に再取得して並びを反映する。
  async function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= ordered.length) return;
    const ids = ordered.map((c) => c.id);
    [ids[index], ids[j]] = [ids[j], ids[index]];
    setMsg(null);
    setBusy(true);
    const { error } = await supabase.rpc("product_category_reorder", { p_store_id: storeId, p_ids: ids });
    setBusy(false);
    if (error) {
      setMsg(error.message.includes("partial ids") ? "一覧が古くなっています。再読込してください"
        : error.message.includes("forbidden") ? "権限がありません"
          : error.message);
    }
    await reload();
  }

  return (
    <div>
      <Toast msg={msg} />

      {/* 純増⑦（mig0063）: カテゴリ管理（レジ/キオスクのタイル見出し・sort_order 順）。 */}
      <section className="nox-cardtop" style={card}>
        <MasterPageHead
          title="商品カテゴリ"
          count={categories.length}
          desc="レジ・キオスクの商品タイルの見出しになる分類です。∧∨ で並べ替えると、レジのタイル順もこの順になります。"
          action={isManagerUp
            ? <button type="button" style={t.btnGold} className="nox-pthead-act" onClick={openNew}>＋ カテゴリを追加</button>
            : undefined}
        />

        {categories.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 8px" }}>
            カテゴリ未登録です。登録するとレジの商品タイルがカテゴリ別に並びます（未登録なら種別 drink/champ/bottle で並びます）。
          </p>
        ) : (
          // ★④c: 商品一覧と同じヘッダ付きテーブル（.nox-ptable を流用）＝2ページで表の見え方を揃える。
          <div className="nox-ptwrap">
            <table className="nox-ptable">
              <thead>
                <tr>
                  <th className="col-cat">並び</th>
                  <th className="col-name">カテゴリ名</th>
                  <th className="col-margin" title="このカテゴリに割り当てられている商品の数">商品数</th>
                  <th className="col-state">状態</th>
                  <th className="col-act">操作</th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((c, i) => (
                  <tr key={c.id}>
                    <td className="col-cat" data-label="並び">
                      {isManagerUp ? (
                        <span style={{ display: "inline-flex", gap: 4 }}>
                          <button type="button" className="nox-ordbtn" aria-label="上へ"
                            disabled={busy || i === 0} onClick={() => move(i, -1)}>∧</button>
                          <button type="button" className="nox-ordbtn" aria-label="下へ"
                            disabled={busy || i === ordered.length - 1} onClick={() => move(i, 1)}>∨</button>
                        </span>
                      ) : (
                        <span style={{ ...t.num, color: "var(--sub)" }}>{c.sort_order}</span>
                      )}
                    </td>
                    <td className="col-name" data-label="カテゴリ名">
                      <span className="nox-pt-name">{c.name}</span>
                      {/* 並び替え後は 1..N の連番になる＝現在値をそのまま出して検収できるようにする */}
                      <span className="nox-pt-sub">並び順 {c.sort_order}</span>
                    </td>
                    <td className="col-margin" data-label="商品数">
                      <span style={t.num}>{products.filter((p) => p.category_id === c.id).length}</span>
                    </td>
                    <td className="col-state" data-label="状態">
                      <span className={`nox-statebadge${c.is_active ? " on" : ""}`}><i />{c.is_active ? "有効" : "無効"}</span>
                    </td>
                    <td className="col-act" data-label="操作">
                      {isManagerUp && <button type="button" style={btnLight} onClick={() => openEdit(c)}>編集</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ★④c: フォームは中央モーダル（商品と同じ部品＝Modal の scroll・.nox-field・.nox-formmodal-*）。
          一覧の直下に同じ地色の入力行が続く形をやめ、視覚的に分離する。 */}
      {isManagerUp && modalOpen && (
        <Modal onClose={() => setModalOpen(false)} maxWidth={520} scroll>
          <div className="nox-formmodal-head">
            <strong>{cId ? "カテゴリを編集" : "カテゴリを追加"}</strong>
            <button type="button" className="nox-formmodal-x" onClick={() => setModalOpen(false)} aria-label="閉じる">×</button>
          </div>

          <div className="nox-field">
            <span className="lab">カテゴリ名<span className="req">*</span></span>
            <input placeholder="例 焼酎" value={cCatName} maxLength={40}
              onChange={(e) => setCCatName(e.target.value)} style={inputLg} />
            <span className="hint">レジ・キオスクのタイル見出しになります（40字以内）。並び順は一覧の ∧∨ で変更します。</span>
          </div>

          <div className="nox-field">
            <span className="lab">状態</span>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 9, fontSize: 13, cursor: "pointer" }}>
              {/* 有効トグル＝段G の canonical スイッチ（既存 boolean のみ） */}
              <button type="button" role="switch" aria-checked={cActive} aria-label="有効"
                className={cActive ? "nox-switch on" : "nox-switch"} onClick={() => setCActive((v) => !v)}><i /></button>
              有効
            </label>
            <span className="hint">無効にすると、レジ・キオスクのタイル見出しから外れます（割り当て済みの商品は未分類として残ります）。</span>
          </div>

          <div className="nox-formmodal-foot">
            <button style={btnPrimaryLg} disabled={busy || !cCatName.trim()} onClick={saveCategory}>
              {cId ? "更新" : "登録"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
