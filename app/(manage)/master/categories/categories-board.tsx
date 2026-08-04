"use client";

// 商品カテゴリ（マスタIA再編 レーン③）。master-board.tsx の view === "products" にあった
// 「商品カテゴリ（クリックで編集）」セクションをそのまま移設したもの。
// ★JSX・state・set_product_category の5引数・原則7（明示 boolean）は1文字も変えていない。
// ★並び順は数値入力のまま（裁定G＝D&D は料金レーンと同時。ここでは入れない）。
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import Toast from "@/components/ui/toast";
import MasterPageHead from "../master-page-head";
import {
  fetchProducts, fetchProductCategories,
  type MasterProduct as Product, type MasterCategory as Category,
} from "@/lib/nox/master/queries";

const card: React.CSSProperties = t.card;
const input: React.CSSProperties = { ...t.input, width: "auto", padding: "8px 10px", fontSize: 13 };
const btnDark: React.CSSProperties = { ...t.btnGold, ...t.btnSm };
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };

export type CategoriesInitial = { categories: Category[]; products: Product[] };

export default function CategoriesBoard({ storeId, isManagerUp, initial }: {
  storeId: string; isManagerUp: boolean; initial: CategoriesInitial;
}) {
  const supabase = createClient();
  const [categories, setCategories] = useState<Category[]>(initial.categories);
  const [products, setProducts] = useState<Product[]>(initial.products);
  const [msg, setMsg] = useState<string | null>(null);

  // カテゴリ管理フォーム（set_product_category）
  const [cId, setCId] = useState<string | null>(null);
  const [cCatName, setCCatName] = useState("");
  const [cSort, setCSort] = useState(0);
  const [cActive, setCActive] = useState(true);

  async function reload() {
    const [cats, ps] = await Promise.all([fetchProductCategories(supabase), fetchProducts(supabase)]);
    setCategories(cats);
    setProducts(ps);
  }

  // 純増⑦（mig0063）: カテゴリ upsert（set_product_category・owner/manager 自店＝RPC 側も二重で拒否）
  async function saveCategory() {
    if (!cCatName.trim()) return;
    setMsg(null);
    const { error } = await supabase.rpc("set_product_category", {
      p_id: cId, p_store_id: storeId, p_name: cCatName.trim(), p_sort_order: cSort,
      p_is_active: cActive, // 明示 boolean（原則7）
    });
    setMsg(error
      ? (error.message.includes("duplicate name") ? "同じ名前のカテゴリが既にあります"
        : error.message.includes("bad name") ? "カテゴリ名は40字以内で入力してください"
        : error.message.includes("forbidden") ? "権限がありません"
        : error.message)
      : cId ? "カテゴリを更新しました" : "カテゴリを登録しました");
    if (!error) { setCId(null); setCCatName(""); setCSort(0); setCActive(true); }
    await reload();
  }

  return (
    <div>
      <Toast msg={msg} />

      {/* 純増⑦（mig0063）: カテゴリ管理（レジ/キオスクのタイル見出し・sort_order 順）。書込は set_product_category のみ。 */}
      <section className="nox-cardtop" style={card}>
        {/* ★④a-3: 3ページ共通ヘッダ（MasterPageHead）＝タブで行き来しても見出しの段差が出ない。
            文言そのものは変えていない（ラベル見直しは④b）。 */}
        <MasterPageHead
          title="商品カテゴリ（クリックで編集）"
          count={categories.length}
          desc="レジ・キオスクの商品タイルの見出しになる分類です。並び順と有効／無効を管理します。"
        />
        {categories.length === 0 && (
          <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 8px" }}>
            カテゴリ未登録です。登録するとレジの商品タイルがカテゴリ別に並びます（未登録なら種別 drink/champ/bottle で並びます）。
          </p>
        )}
        {categories.length > 0 && (
          <table style={{ borderCollapse: "collapse", fontSize: 12, marginBottom: 10 }}>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id}
                  onClick={() => isManagerUp && (setCId(c.id), setCCatName(c.name), setCSort(c.sort_order), setCActive(c.is_active))}
                  style={{ borderBottom: "1px solid var(--line)", cursor: isManagerUp ? "pointer" : "default" }}>
                  <td style={{ padding: 6, fontWeight: 700 }}>{c.name}</td>
                  <td style={{ padding: 6, ...t.num, color: "var(--sub)" }}>並び {c.sort_order}</td>
                  <td style={{ padding: 6, ...t.num, color: "var(--sub)" }}>
                    商品 {products.filter((p) => p.category_id === c.id).length}
                  </td>
                  <td style={{ padding: 6, color: c.is_active ? "var(--ok)" : "var(--sub)" }}>{c.is_active ? "有効" : "無効"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {isManagerUp && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--sub)" }}>{cId ? "編集中" : "新規"}</span>
            <input placeholder="カテゴリ名（例 焼酎）" value={cCatName} onChange={(e) => setCCatName(e.target.value)} maxLength={40} style={{ ...input, width: 170 }} />
            <label style={{ fontSize: 12 }}>並び順 <input type="number" value={cSort} onChange={(e) => setCSort(Number(e.target.value))} style={{ ...input, width: 60 }} /></label>
            {/* 有効トグル＝段G の canonical スイッチ（既存 boolean のみ・見た目のみ） */}
            <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, cursor: "pointer" }}>
              <button type="button" role="switch" aria-checked={cActive} aria-label="有効"
                className={cActive ? "nox-switch on" : "nox-switch"} onClick={() => setCActive((v) => !v)}><i /></button>
              有効
            </label>
            <button style={btnDark} disabled={!cCatName.trim()} onClick={saveCategory}>{cId ? "更新" : "登録"}</button>
            {cId && <button style={btnLight} onClick={() => { setCId(null); setCCatName(""); setCSort(0); setCActive(true); }}>新規に戻す</button>}
          </div>
        )}
      </section>
    </div>
  );
}
