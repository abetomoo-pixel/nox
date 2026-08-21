"use client";

// 商品マスタ（マスタIA再編 レーン②）。master-board.tsx の view === "products" のうち
// 「商品ハブ／商品リスト／商品フォーム」をそのまま移設したもの。
// ★JSX・state・送る RPC 引数・原則7（明示 boolean）は1文字も変えていない＝場所を移しただけ。
//   カテゴリ管理と在庫の入出庫はレーン③まで master-board.tsx に残る（ここには無い）。
// ★初期値は page.tsx（server）が取得して props で渡す。保存後の再取得だけ client から
//   同じ queries.ts の関数を呼ぶ＝取得内容は移設前の load() と同一。
import { useEffect, useMemo, useState } from "react";
import SegSelect from "@/components/ui/seg-select";
import { createClient } from "@/lib/supabase/client";
import * as t from "@/lib/nox/ui/theme";
import { groupProducts } from "@/lib/nox/ui/product-groups";
import Toast from "@/components/ui/toast";
import Modal from "@/components/ui/modal";
import MasterPageHead from "../master-page-head";
import {
  fetchProducts, fetchProductCategories, fetchProductCosts, fetchStockTotals,
  type MasterProduct as Product, type MasterCategory as Category,
} from "@/lib/nox/master/queries";
import { STOCK_REASON_RESTOCK } from "@/lib/nox/stock/reasons";
import { swapAdjacent, reorderErrJa } from "@/lib/nox/ui/reorder";
import {
  parseProductBulk, duplicateWarnings, checkInactiveCategoryConflicts,
  newCategories, countByType, TYPE_LABEL_JA as BULK_TYPE_LABEL_JA,
  type ProductBulkItem,
} from "@/lib/nox/product-bulk";

const yen = (n: number) => "¥" + n.toLocaleString();
const card: React.CSSProperties = t.card;
const btnLight: React.CSSProperties = { ...t.btnGhost, ...t.btnSm };
// ★④c: inputLg / btnPrimaryLg / btnGhostLg は theme.ts へ引き上げた（カテゴリ側と共有）。
const { inputLg, btnPrimaryLg, btnGhostLg } = t;

const EMPTY_UNIT4 = { hon: 0, jonai: 0, dohan: 0, free: 0 };
const PAGE = 40; // 逐次表示の1ページ分（「もっと見る」で +PAGE）
const TYPE_LABEL_JA: Record<string, string> = { drink: "ドリンク", champ: "シャンパン", bottle: "ボトル" };

// ★④a-3: 商品名セルの下段に出すバック設定。DB 現物（mig0005 の products DDL）は次のとおり:
//   back_mode  text not null default 'rate' check (back_mode in ('rate','unit4'))   ← ★2値のみ
//   back_value int  … rate モードの率(%)。CHECK products_rate_value_chk で rate なら非 null
//   unit4_json jsonb … unit4 モードの {hon,jonai,dohan,free} 単価。CHECK products_unit4_json_chk で非 null
// ★「固定額」モードは DB に存在しない（back_mode は rate/unit4 の2値・UI の select も2択）。
//   よって実際に出るのは「率%」「4段階」の2パターンで、「未設定」は CHECK 違反の行が
//   混入した場合の防御表示（構造上は起きない）。unit4 の4つ組はここでは展開しない（混むため）。
// ★本指名pt はここに出さない（別軸の値）。
function backLabel(p: Product): string {
  if (p.back_mode === "rate") return p.back_value == null ? "バック 未設定" : `バック ${p.back_value}%`;
  if (p.back_mode === "unit4") return p.unit4_json == null ? "バック 未設定" : "バック 4段階";
  return "バック 未設定";
}

// 純増①（mig0061）在庫セル: バッジ（数値）＋残量バー。バーは reorder_point 比（満位＝発注点×2）で、
//   reorder_point null＝しきい無しゆえバーを出さず数値のみ。
//   ★レーン④a: 「0以下」と「発注点以下」を赤系バッジで自己主張させる（旧: 低在庫は金 --gold2）。
//     0以下＝塗り、発注点以下＝枠線の2段階で区別する。数値・発注点・バーの情報量は落としていない。
function stockCell(qty: number, reorderPoint: number | null) {
  const neg = qty <= 0;
  const low = !neg && reorderPoint !== null && qty <= reorderPoint;
  const full = reorderPoint !== null && reorderPoint > 0 ? reorderPoint * 2 : null;
  const pct = full ? Math.max(0, Math.min(100, (qty / full) * 100)) : 0;
  return (
    <span style={{ display: "inline-block" }}>
      <span className={`nox-stkbadge${neg ? " neg" : low ? " low" : ""}`} style={t.num}>{qty}</span>
      {/* ★④a-3: 「/ 発注点 n」を在庫セルへ戻した（④a-2 で商品名下段へ移していた分。
          下段はバック設定に使う）。発注点 null なら従来どおり何も出さない。 */}
      {reorderPoint !== null && (
        <>
          <span style={{ fontSize: 10, color: "var(--sub)", marginLeft: 5 }}>/ 発注点 {reorderPoint}</span>
          <span className={`nox-stockbar${neg ? " neg" : low ? " low" : ""}`} aria-hidden="true">
            <i style={{ width: `${qty < 0 ? 100 : pct}%` }} />
          </span>
        </>
      )}
    </span>
  );
}

// ソート対象は数値4列のみ（原価・利益率・販売価格・在庫）。null=未ソート＝取得順（type→name）。
type SortKey = "cost" | "margin" | "price" | "stock";

// ★④b-2: フォームの入力値ひとまとめ。個々の state はそのまま（分割していない）で、
//   「開いた時の値」と「今の値」を同じ形で作れるようにするための型＝未保存判定に使う。
type FormValues = {
  type: string; category: string; name: string; price: number; cost: string;
  backMode: string; backValue: number; unit4: Record<string, number>; honPt: number;
  exempt: boolean; active: boolean; reorder: string; catId: string;
};
const EMPTY_FORM: FormValues = {
  type: "drink", category: "", name: "", price: 0, cost: "",
  backMode: "rate", backValue: 50, unit4: { ...EMPTY_UNIT4 }, honPt: 0,
  exempt: false, active: true, reorder: "", catId: "",
};

export type ProductsInitial = {
  products: Product[];
  categories: Category[];
  costs: Record<string, number>;
  costsError: boolean;
  stock: Record<string, number>;
};

export default function ProductsBoard({ storeId, isManagerUp, initial }: {
  storeId: string; isManagerUp: boolean; initial: ProductsInitial;
}) {
  const supabase = createClient();
  const [products, setProducts] = useState<Product[]>(initial.products);
  const [categories, setCategories] = useState<Category[]>(initial.categories);
  const [costs, setCosts] = useState<Record<string, number>>(initial.costs);
  // 0行（＝原価なし・RLS で返らない）と 取得失敗 を区別する。失敗のときだけ保存を止める＝
  // 原価欄が空のまま p_cost=null を送って cost 行を消す事故を構造的に作らない。
  const [costsError, setCostsError] = useState(initial.costsError);
  const [stock, setStock] = useState<Record<string, number>>(initial.stock);
  const [msg, setMsg] = useState<string | null>(null);

  // 商品フォーム（p_is_active は常に明示 boolean を送る＝CLAUDE.md 原則7）
  const [pId, setPId] = useState<string | null>(null);
  const [pType, setPType] = useState("drink");
  const [pCategory, setPCategory] = useState("");
  const [pName, setPName] = useState("");
  const [pPrice, setPPrice] = useState(0);
  const [pCost, setPCost] = useState("");
  const [pBackMode, setPBackMode] = useState("rate");
  const [pBackValue, setPBackValue] = useState(50);
  const [pUnit4, setPUnit4] = useState<Record<string, number>>({ ...EMPTY_UNIT4 });
  const [pHonPt, setPHonPt] = useState(0);
  // キャストドリンク（mig0069）: 按分除外フラグ。常に明示送信（原則7）。
  const [pExempt, setPExempt] = useState(false);
  const [pActive, setPActive] = useState(true);
  // 純増①（mig0062）: 発注点。空欄＝しきい無し（null 送信）＝原則7どおり常に明示値を送る。
  const [pReorder, setPReorder] = useState("");
  // 純増⑦（mig0063）: カテゴリ。""＝未分類（null 送信）＝原則7 同列で常に明示値。
  const [pCatId, setPCatId] = useState("");

  // ── マスタ刷新（情報設計）: ハブ選択・一覧フィルタ・逐次表示・フォーム段組み ──
  //   すべて presentation（絞り込みと表示件数の話）＝送る引数・権限・数値は不変。
  const [selCat, setSelCat] = useState<string>("__all"); // "__all" | "__uncat" | category_id | type key
  const [showInactive, setShowInactive] = useState(false); // 既定＝有効のみ
  const [visible, setVisible] = useState(PAGE); // 逐次表示（verify org 297件でも破綻しない）
  const [detailOpen, setDetailOpen] = useState(false); // 商品フォームの「詳細」節（既定 閉）
  // ★レーン④a: 数値4列のソート。null=未ソート＝取得順のまま＝既定の並びは従来と同一。
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  // ★レーン④b-2/④b-3: フォームはモーダルへ移設した（下部固定フォームは撤去）。
  //   ④b-2 は右ドロワーだったが、実物では左の一覧が暗く落ちて読めず「一覧が見えたまま」という
  //   ドロワーの利点が成立しなかったため、④b-3 で中央モーダルへ戻した
  //   （variant="drawer" 自体は modal.tsx に残置＝他画面で使う余地がある。ここで使わないだけ）。
  const [modalOpen, setModalOpen] = useState(false);
  // 未保存判定の基準＝モーダルを開いた時点の値の署名。現在値と違えば「変更あり」。
  const [baseSig, setBaseSig] = useState("");
  // ★④b-3: 保存した行を一瞬ハイライトする（閉じると結果が見えないため・トーストより強い）。
  const [highlightId, setHighlightId] = useState<string | null>(null);
  // ★④c: 行の1タップ操作（有効切替・入荷）。busyId は二度押し防止。
  const [busyId, setBusyId] = useState<string | null>(null);
  // ⑤一括登録（裁定J・mig0080）
  const [bulkOpen, setBulkOpen] = useState(false);
  const [stockTarget, setStockTarget] = useState<Product | null>(null);
  const [stDelta, setStDelta] = useState(0);
  const [stReason, setStReason] = useState("");

  // ハイライト対象が決まったらその行までスクロールし、1.6秒で自動解除する。
  //   ★フィルタや「もっと見る」の外にある行は DOM に無い＝スクロールは起きない（解除だけ走る）。
  useEffect(() => {
    if (!highlightId) return;
    document.getElementById("prow-" + highlightId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = setTimeout(() => setHighlightId(null), 1600);
    return () => clearTimeout(timer);
  }, [highlightId]);

  // 保存後の再取得。取得内容は移設前の load() と同一（server の初期取得と同じ関数を使う）。
  async function reload() {
    const [ps, cats, cs, st] = await Promise.all([
      fetchProducts(supabase), fetchProductCategories(supabase),
      fetchProductCosts(supabase), fetchStockTotals(supabase),
    ]);
    setProducts(ps); setCategories(cats);
    setCosts(cs.costs); setCostsError(cs.failed);
    setStock(st);
  }

  // ★④b-2: フォーム値をまとめて適用する。同じ値から署名（baseSig）も作るので、
  //   「開いた直後は必ず未変更」が構造的に保証される（setter を個別に呼ぶ書き方だと取りこぼす）。
  function applyForm(v: FormValues) {
    setPType(v.type); setPCategory(v.category); setPName(v.name); setPPrice(v.price);
    setPCost(v.cost); setPBackMode(v.backMode); setPBackValue(v.backValue);
    setPUnit4(v.unit4); setPHonPt(v.honPt); setPExempt(v.exempt); setPActive(v.active);
    setPReorder(v.reorder); setPCatId(v.catId);
    setBaseSig(JSON.stringify(v));
  }
  const currentValues = (): FormValues => ({
    type: pType, category: pCategory, name: pName, price: pPrice, cost: pCost,
    backMode: pBackMode, backValue: pBackValue, unit4: pUnit4, honPt: pHonPt,
    exempt: pExempt, active: pActive, reorder: pReorder, catId: pCatId,
  });
  // 現在のフォーム値の署名。baseSig と違えば未保存の変更あり。
  const currentSig = () => JSON.stringify(currentValues());

  // ★④b-2「＋ 商品を追加」: 新規状態でドロワーを開く（旧: 下部フォームへスクロール）。
  function newProduct() {
    setPId(null);
    applyForm(EMPTY_FORM);
    setDetailOpen(false); // 新規は「詳細」閉じ＝編集時の hasDetail 自動展開と同じ規則
    setModalOpen(true);
  }

  function editProduct(p: Product) {
    const v: FormValues = {
      type: p.type, category: p.category ?? "", name: p.name, price: p.price,
      cost: costs[p.id] == null ? "" : String(costs[p.id]),
      backMode: p.back_mode, backValue: p.back_value ?? 0,
      unit4: p.unit4_json ?? { ...EMPTY_UNIT4 }, honPt: p.hon_pt,
      exempt: p.back_exempt_from_split, active: p.is_active,
      reorder: p.reorder_point == null ? "" : String(p.reorder_point),
      catId: p.category_id ?? "",
    };
    setPId(p.id);
    applyForm(v);
    // 「詳細」は既定 閉。ただし編集時に値が入っている（＝運用で使っている）なら自動で開く。
    const hasDetail = costs[p.id] != null || p.reorder_point != null || p.hon_pt > 0
      || p.back_mode === "unit4" || (p.back_value ?? 0) !== 0 || p.back_exempt_from_split;
    setDetailOpen(hasDetail);
    setModalOpen(true);
  }

  // ★④c（裁定K）: 一覧の状態バッジを1タップで切り替える。
  //   ★set_product は使わない。15引数を再送すると、その間に他端末が直した name/price/back_* を
  //     last-write-wins で巻き戻す。set_product_active は is_active だけを更新する（mig0077）。
  //   ★無効化は会計から消える操作なので確認を挟む。有効化は確認しない。
  //   ★「無効も表示」が OFF のとき無効化すると行は一覧から消える。行が消えてから気づくのを避けるため、
  //     確認文でその旨を先に伝え、成功後は商品名入りのトーストを残す（消えた理由が画面に残る）。
  async function toggleActive(p: Product) {
    const next = !p.is_active;
    if (!next) {
      const willVanish = !showInactive;
      const msg = `「${p.name}」を無効にします。レジ・キオスクの商品タイルから外れ、会計に出せなくなります。`
        + (willVanish ? "\n（「無効も表示」が OFF のため、この行は一覧から消えます）" : "");
      if (!window.confirm(msg)) return;
    }
    setMsg(null);
    setBusyId(p.id);
    const { error } = await supabase.rpc("set_product_active", {
      p_id: p.id, p_store_id: storeId, p_is_active: next, // 明示 boolean（原則7）
    });
    setBusyId(null);
    if (error) {
      // 失敗時は画面を触っていないので「元に戻す」処理は不要（楽観更新をしていない）
      setMsg(error.message.includes("forbidden") ? "権限がありません"
        : error.message.includes("not found") ? "対象が見つかりません。再読込してください"
          : error.message);
      return;
    }
    setMsg(next ? `「${p.name}」を有効にしました` : `「${p.name}」を無効にしました`);
    await reload();
  }

  // ★④c（裁定L）: 行から入荷を記録する。★増減（delta）で入れる＝append-only の意味論そのまま。
  //   現在庫の絶対値を書き換える形にはしない（棚卸しは /master/stock の仕事）。
  async function addStock() {
    if (!stockTarget || !stDelta) return;
    setMsg(null);
    setBusyId(stockTarget.id);
    // ★④d-2: 理由の既定値は lib/nox/stock/reasons.ts の定数（棚卸し側と1箇所に寄せる）。
    //   自由入力されたときはその文字列を尊重する（DB は自由テキストのまま＝CHECK は足さない）。
    const { error } = await supabase.rpc("product_stock_add", {
      p_product_id: stockTarget.id, p_delta: stDelta, p_reason: stReason.trim() || STOCK_REASON_RESTOCK,
    });
    setBusyId(null);
    if (error) { setMsg(error.message.includes("forbidden") ? "権限がありません" : error.message); return; }
    setMsg(`「${stockTarget.name}」の在庫を ${stDelta > 0 ? "+" : ""}${stDelta} 記録しました`);
    setStockTarget(null); setStDelta(0); setStReason("");
    await reload();
  }

  // ★④b-2: 閉じる。未保存の変更があるときだけ確認する（overlay クリック・閉じるボタン共通）。
  function closeModal() {
    if (currentSig() !== baseSig && !window.confirm("入力内容が保存されていません。閉じてよろしいですか？")) return;
    setModalOpen(false);
  }

  // keepOpen=true は「登録して続けて入力」。新規のときだけ使い、会計区分/表示カテゴリ等は
  //   前回値のまま残し、名称と価格だけ空に戻して次の1件へ続ける。
  async function saveProduct(keepOpen = false) {
    setMsg(null);
    // 原価が読めていない状態の保存は p_cost の値が不明＝送れば cost 行を消しうる。ボタン無効化と二重で止める。
    if (costsError) { setMsg("原価を読み込めませんでした。再読込してください"); return; }
    const { data, error } = await supabase.rpc("set_product", {
      p_id: pId, p_store_id: storeId, p_type: pType, p_category: pCategory || null,
      p_name: pName, p_price: pPrice, p_cost: pCost === "" ? null : Number(pCost),
      p_back_mode: pBackMode,
      p_back_value: pBackMode === "rate" ? pBackValue : null,
      p_unit4: pBackMode === "unit4" ? pUnit4 : null,
      p_hon_pt: pExempt ? 0 : pHonPt, p_is_active: pActive, // 明示 boolean（原則7）
      // mig0069: キャストドリンク指定も常に明示値（原則7）。★ON のとき hon_pt は 0 を送る＝
      //   CHECK products_exempt_hon_pt_chk（exempt なら hon_pt=0）に UI 側で先に合わせ、
      //   'exempt requires hon_pt 0' を発生させない（入力欄も disabled で 0 表示にしてある）。
      p_back_exempt_from_split: pExempt,
      // mig0062: 発注点も常に明示値（空欄＝null＝しきい無し）。省略に頼らない＝原則7 同列。
      p_reorder_point: pReorder.trim() === "" ? null : Number(pReorder),
      // mig0063: カテゴリも常に明示値（""＝未分類＝null）。旧 p_category（text）は現値往復のみ＝deprecated。
      p_category_id: pCatId === "" ? null : pCatId,
    });
    setMsg(error
      ? (error.message.includes("bad category") ? "カテゴリの指定が不正です（他店のカテゴリは選べません）" : error.message)
      : pId ? "商品を更新しました" : "商品を登録しました");
    // ★④b-2: 成功時のみリセットして閉じる。移設前は error でもフォームを消していたが、
    //   モーダルでは「閉じずに中身だけ空になる」＝直す手がかりが消えるので、失敗時は入力を残す。
    if (!error) {
      // set_product は id（新規/更新とも）を返す＝保存した行へスクロールして光らせる材料。
      const savedId = typeof data === "string" ? data : pId;
      if (keepOpen) {
        // ★④b-3「登録して続けて入力」: 区分・カテゴリ・バック等は残し、名称と価格だけ空へ。
        setPId(null);
        applyForm({ ...currentValues(), name: "", price: 0 });
      } else {
        setPId(null); setPName(""); setPPrice(0); setPReorder(""); setPCatId(""); setPExempt(false);
        setModalOpen(false);
      }
      if (savedId) setHighlightId(savedId);
    }
    await reload();
  }

  // ── ハブの並び（⑥）: アクティブなカテゴリが1件以上ならカテゴリ別、0件なら type 別へ
  //   （★判定は register/kiosk のタイル分類 lib/nox/ui/product-groups と同一ルール＝画面間で分類がぶれない）。
  const activeCats = categories.filter((c) => c.is_active).slice().sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "ja"));
  const catMode = activeCats.length > 0;
  const knownCatIds = new Set(activeCats.map((c) => c.id));
  // 一覧の母集合（有効/無効フィルタ＝既定は有効のみ）
  const pool = products.filter((p) => showInactive || p.is_active);
  const inHub = (p: Product, key: string) =>
    key === "__all" ? true
      : key === "__uncat" ? (!p.category_id || !knownCatIds.has(p.category_id))
        : catMode ? p.category_id === key : p.type === key;
  // ハブカード（カテゴリは0件でも出す＝マスタ管理では空カテゴリも見えている方が正しい）
  const hubCards = catMode
    ? [
        ...activeCats.map((c) => ({ key: c.id, label: c.name, n: pool.filter((p) => p.category_id === c.id).length })),
        { key: "__uncat", label: "未分類", n: pool.filter((p) => !p.category_id || !knownCatIds.has(p.category_id)).length },
      ]
    : groupProducts(pool, []).map((g) => ({ key: g.key, label: g.label, n: g.items.length }));
  const filtered = pool.filter((p) => inHub(p, selCat));
  const selectHub = (key: string) => { setSelCat(key); setVisible(PAGE); };

  // ── mig0081 並び替え（裁定3）: 平坦一覧は type→name のまま。単一カテゴリに絞ったときだけ
  //   行に ∧∨ を出し、その状態の並びを sort_order にする。
  //   ★条件は3つとも必要:
  //     ① catMode（カテゴリ運用の店）② selCat が単一カテゴリ or 未分類 ③ 数値列ソート未適用
  //       （数値ソート中に ∧∨ を出すと「見えている順」と「保存される順」が食い違う）
  //   ★未分類（__uncat）は RPC の p_category_id=null スコープに対応する。
  const reorderMode = isManagerUp && catMode && sortKey === null
    && (selCat === "__uncat" || knownCatIds.has(selCat));
  const reorderCatId = selCat === "__uncat" ? null : selCat;
  // 並び替えモードのときは「そのスコープの全商品」を sort_order 順で扱う
  //   （is_active 不問＝RPC が全件要求するため。無効も表示 OFF でも配列には含める）
  const scopeAll = reorderMode
    ? products
        .filter((p) => (reorderCatId === null ? (!p.category_id || !knownCatIds.has(p.category_id)) : p.category_id === reorderCatId))
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "ja"))
    : [];

  /** ∧∨: scopeAll 内で i 番目を delta 方向へ入れ替え、全件配列を product_reorder に送る。
   *  料金UIレーン C2: swap とエラー日本語化を共用ヘルパー（lib/nox/ui/reorder）へ集約。
   *  busy の形（busyId＝行単位）と「失敗時は reload しない」方針はこの画面の従来挙動のまま。
   *  ★partial ids の文言だけ共通化で categories と同一文になる（表示差分はこの1点のみ）。 */
  async function moveProduct(id: string, delta: -1 | 1) {
    if (!reorderMode || busyId) return;
    const idx = scopeAll.findIndex((p) => p.id === id);
    const ids = swapAdjacent(scopeAll.map((p) => p.id), idx, delta);
    if (!ids) return;
    setBusyId(id);
    setMsg(null);
    const { error } = await supabase.rpc("product_reorder", {
      p_store_id: storeId, p_category_id: reorderCatId, p_ids: ids,
    });
    setBusyId(null);
    if (error) {
      setMsg(reorderErrJa(error.message));
      return;
    }
    await reload();
  }

  // ── ★レーン④a: 列ソート（client 完結・取得も引数も不変）──
  //   利益率は原価がある行だけ計算できる＝原価/利益率は null を持ち得る。null は方向によらず末尾へ寄せる
  //  （昇順で先頭に空欄が並ぶと「安い順」を見に来た目的が達成できないため）。
  const marginOf = (p: Product) => {
    const c = costs[p.id];
    return c != null && p.price > 0 ? Math.round(((p.price - c) / p.price) * 100) : null;
  };
  const sortValue = (p: Product, key: SortKey): number | null =>
    key === "cost" ? (costs[p.id] ?? null)
      : key === "margin" ? marginOf(p)
        : key === "price" ? p.price
          : (stock[p.id] ?? 0);
  // mig0081: 並び替えモード中は sort_order 順で見せる（保存される順と見えている順を一致させる）。
  //   ★モード外の平坦一覧は従来どおり取得順（type→name）＝裁定3。
  const sorted = reorderMode
    ? filtered.slice().sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "ja"))
    : sortKey === null ? filtered : filtered.slice().sort((a, b) => {
    const va = sortValue(a, sortKey), vb = sortValue(b, sortKey);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;   // null は常に末尾
    if (vb === null) return -1;
    return sortDir === "asc" ? va - vb : vb - va;
  });
  const shown = sorted.slice(0, visible);
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };
  const ariaSort = (key: SortKey): "ascending" | "descending" | "none" =>
    sortKey === key ? (sortDir === "asc" ? "ascending" : "descending") : "none";

  // 表示カテゴリ名の解決（category_id → name。null／他店・削除済みを指す迷子は「未分類」）。
  //   ★会計区分（products.type）とは別列。混ぜない（裁定F）。
  const catNameById = new Map(categories.map((c) => [c.id, c.name]));

  return (
    <div className="nox-mv1">
      <Toast msg={msg} />

      {/* ⑥ ハブ: カテゴリカード → クリックでその分類に絞る（すべて／未分類つき）。
          カテゴリ0件の店は type 別カードへフォールバック（register のタイル分類と同じ判定）。 */}
      <section className="nox-cardtop" style={card}>
        {/* ★レーン④a-3 ヘッダ: 3ページ共通部品（MasterPageHead）へ寄せてスケールを揃える。 */}
        <MasterPageHead
        eyebrow="PRODUCT MASTER"
          title="商品"
          count={filtered.length}
          desc="販売価格・原価・在庫・有効状態を一覧で確認できます。"
          action={isManagerUp
            ? (
              <span className="nox-pthead-act" style={{ display: "inline-flex", gap: 8 }}>
                {/* ⑤一括登録（裁定J）: 新規テナントが40件を手打ちしないための導線。 */}
                <button type="button" style={t.btnGhost} onClick={() => setBulkOpen(true)}>一括登録</button>
                <button type="button" style={t.btnGold} onClick={newProduct}>＋ 商品を追加</button>
              </span>
            )
            : undefined}
        />

        {/* ⑥ ハブ（④a-2 でピル化）: クリックでその分類に絞る（すべて／未分類つき）。
            カテゴリ0件の店は type 別へフォールバック（register のタイル分類と同じ判定）。
            ★分類の判定・件数・選択の挙動は④a から一切変えていない＝形だけをピルにした。 */}
        <div className="nox-pillbar">
          <button type="button" className={`nox-pill${selCat === "__all" ? " on" : ""}`} onClick={() => selectHub("__all")}>
            すべて<span className="n">{pool.length}</span>
          </button>
          {hubCards.map((h) => (
            <button key={h.key} type="button" className={`nox-pill${selCat === h.key ? " on" : ""}`} onClick={() => selectHub(h.key)}>
              {h.label}<span className="n">{h.n}</span>
            </button>
          ))}
        </div>

        {/* ③ 一覧: 運用で見る情報だけの列（名称・区分・カテゴリ・原価・利益率・価格・在庫・状態）。 */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: "var(--sub)" }}>
            {filtered.length > shown.length ? `${shown.length} / ${filtered.length} 件表示中` : `${filtered.length} 件`}
          </span>
          {/* mig0081: 並び替えが効く状態であることを明示する（∧∨ が出る条件は文章で説明しない＝
              「今この並びがレジに出る」という結果だけを伝える）。 */}
          {reorderMode && (
            <span style={{ fontSize: 11.5, color: "var(--gold2)" }}>
              この並び順がレジ・キオスクのタイル順になります（∧∨ で変更）
            </span>
          )}
          <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, cursor: "pointer", marginLeft: "auto" }}>
            <button type="button" role="switch" aria-checked={showInactive} aria-label="無効も表示"
              className={showInactive ? "nox-switch on" : "nox-switch"}
              onClick={() => { setShowInactive((v) => !v); setVisible(PAGE); }}><i /></button>
            無効も表示
          </label>
        </div>
        {filtered.length === 0 && <p style={{ fontSize: 12.5, color: "var(--sub)", margin: "0 0 8px" }}>該当する商品がありません。</p>}
        {/* ★レーン④a: 1本のテキスト行 → 列テーブル。40件を上から舐めて異常行（利益率など）を
            見つけられる形にする。会計区分（products.type）と表示カテゴリ（product_categories）は
            必ず別列＝裁定F。利益率は原価の隣（原価との関係を示す値なので）。 */}
        {filtered.length > 0 && (
        <div className="nox-ptwrap">
        <table className="nox-ptable is-products">
          <thead>
            <tr>
              <th className="col-name">商品名</th>
              {/* ★④b-3: 2列の違いが伝わっていなかったので列見出しにも補足（title 属性）。
                  フォーム側のセレクト下の1行と同趣旨を短くしたもの。 */}
              <th className="col-kind" title="バック計算・日報の売上区分・キャストドリンク申請の可否を決めます。登録後は変更できません">会計区分</th>
              <th className="col-cat" title="レジ画面での並び分類です。いつでも変更できます">表示カテゴリ</th>
              {/* ソート可能な4列。th は既定でフォーカスを受けないので tabIndex＋Enter/Space を足す
                  （マウス以外でも並べ替えられるようにする）。 */}
              {([["cost", "原価"], ["margin", "利益率"], ["price", "販売価格"], ["stock", "在庫"]] as [SortKey, string][]).map(([k, label]) => (
                <th key={k} className={`col-${k} sortable`} aria-sort={ariaSort(k)} tabIndex={0}
                  onClick={() => toggleSort(k)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSort(k); } }}>
                  {label}
                  {/* ★④a-2: 矢印を常時表示（薄）し、アクティブな向きだけ金にする＝押せることが判る。 */}
                  <span className="arrow" aria-hidden="true">
                    <i className={sortKey === k && sortDir === "asc" ? "on" : ""}>▲</i>
                    <i className={sortKey === k && sortDir === "desc" ? "on" : ""}>▼</i>
                  </span>
                </th>
              ))}
              <th className="col-state">状態</th>
              <th className="col-act">操作</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => {
              const cost = costs[p.id];
              const margin = marginOf(p);
              // ★④c（裁定M）: 行クリックでの編集は廃止。行に有効トグルと入荷が乗るため、
              //   押すつもりのない場所で編集モーダルが開くのを防ぐ＝編集は「編集」ボタンのみ。
              return (
                <tr key={p.id} id={`prow-${p.id}`}
                  className={highlightId === p.id ? "nox-rowflash" : undefined}>
                  <td className="col-name" data-label="商品名">
                    {/* ★④a-3: アイコン枠は撤去（会計区分は隣の列にあり、頭文字は同じ情報の二重表示だった）。
                        名前セルは2段のまま＝上に商品名、下にバック設定。
                        下段は「未設定」でも必ず文字を出す＝行高が行によって変わらない。 */}
                    <span className="nox-ptnamecell">
                      <span className="nox-pt-name">{p.name}</span>
                      {/* 状態列を畳む幅（901〜1180）だけ、無効を名前の隣にバッジで戻す＝情報を消さない */}
                      {!p.is_active && <span className="nox-statebadge nox-pt-inlinestate"><i />無効</span>}
                      <span className="nox-pt-sub">{backLabel(p)}</span>
                    </span>
                  </td>
                  <td className="col-kind" data-label="会計区分">{TYPE_LABEL_JA[p.type] ?? p.type}</td>
                  <td className="col-cat" data-label="表示カテゴリ">
                    <span className="nox-catbadge">
                      {p.category_id && catNameById.has(p.category_id) ? catNameById.get(p.category_id) : "未分類"}
                    </span>
                  </td>
                  <td className="col-cost" data-label="原価">
                    {cost != null ? <span style={{ ...t.num, color: "var(--sub)" }}>{yen(cost)}</span> : <span style={{ color: "var(--sub)" }}>—</span>}
                  </td>
                  <td className="col-margin" data-label="利益率">
                    {margin != null ? <span style={t.num}>{margin}%</span> : <span style={{ color: "var(--sub)" }}>—</span>}
                  </td>
                  <td className="col-price" data-label="販売価格">
                    <span style={{ ...t.num, fontSize: 13.5, fontWeight: 700, color: "var(--champ)", whiteSpace: "nowrap" }}>{yen(p.price)}</span>
                  </td>
                  {/* 純増①（mig0061）: 残量バー＝Σdelta と reorder_point のみ（新規取得なし・表示のみ）。 */}
                  <td className="col-stock" data-label="在庫">{stockCell(stock[p.id] ?? 0, p.reorder_point)}</td>
                  <td className="col-state" data-label="状態">
                    {/* ★④c（裁定K）: ●ドット付きバッジを1タップのトグルに（set_product_active）。
                        manager 未満は従来どおり表示のみ（span のまま）。 */}
                    {isManagerUp ? (
                      <button type="button" disabled={busyId === p.id}
                        className={`nox-statebadge is-btn${p.is_active ? " on" : ""}`}
                        title={p.is_active ? "クリックで無効にする" : "クリックで有効にする"}
                        aria-pressed={p.is_active}
                        onClick={() => toggleActive(p)}><i />{p.is_active ? "有効" : "無効"}</button>
                    ) : (
                      <span className={`nox-statebadge${p.is_active ? " on" : ""}`}><i />{p.is_active ? "有効" : "無効"}</span>
                    )}
                  </td>
                  <td className="col-act" data-label="操作">
                    {isManagerUp && (
                      <span style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                        {/* ★mig0081: 並び替え ∧∨。単一カテゴリ絞り込み＋数値ソート未適用のときだけ出す。
                            端（先頭/末尾）は disabled＝押せるのに何も起きない状態を作らない。 */}
                        {reorderMode && (() => {
                          const i = scopeAll.findIndex((x) => x.id === p.id);
                          return (
                            <>
                              <button type="button" style={btnLight} disabled={i <= 0 || busyId === p.id}
                                title="上へ" aria-label={`${p.name} を上へ`}
                                onClick={() => void moveProduct(p.id, -1)}>∧</button>
                              <button type="button" style={btnLight}
                                disabled={i < 0 || i >= scopeAll.length - 1 || busyId === p.id}
                                title="下へ" aria-label={`${p.name} を下へ`}
                                onClick={() => void moveProduct(p.id, 1)}>∨</button>
                            </>
                          );
                        })()}
                        {/* ★④c（裁定L）: 入荷は行から。増減で入れる＝append-only の意味論そのまま。 */}
                        <button type="button" style={btnLight} disabled={busyId === p.id}
                          onClick={() => { setStockTarget(p); setStDelta(0); setStReason(""); }}>入荷</button>
                        <button type="button" style={btnLight} onClick={() => editProduct(p)}>編集</button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        )}
        {filtered.length > shown.length && (
          <button style={{ ...btnLight, marginTop: 10 }} onClick={() => setVisible((v) => v + PAGE)}>
            もっと見る（残り {filtered.length - shown.length} 件）
          </button>
        )}
      </section>

      {/* ★④b-2/④b-3: 商品フォームはモーダルへ移設（下部固定フォームは撤去）。
          40件スクロールした先ではなく、行の「編集」を押したその場で開く＝
          「押しても画面外で何も起きていないように見える」を構造的に解消する。
          ★フォーム本体は移設前と同一（新規/編集は pId 1つで切替・単一実装・分割しない）。
          ★④b-3: 中央オーバーレイへ戻し、幅は 540（unit4 の4項目が 2×2 で入る）。
            scroll でカードに高さ上限＋中身スクロールを与え、フッタの sticky を効かせる。 */}
      {/* ★④c（裁定L）: 入荷モーダル。既存 Modal を使い、行内ポップオーバーは新規に作らない。
          現在庫は参考表示で、書き込むのは増減（delta）だけ＝絶対値の上書き経路を作らない。 */}
      {isManagerUp && stockTarget && (
        <Modal onClose={() => setStockTarget(null)} maxWidth={420}>
          <div className="nox-formmodal-head">
            <strong>入荷を記録</strong>
            <button type="button" className="nox-formmodal-x" onClick={() => setStockTarget(null)} aria-label="閉じる">×</button>
          </div>
          <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "var(--sub)", lineHeight: 1.7 }}>
            {stockTarget.name}　現在 <span style={{ ...t.num, color: "var(--ink)", fontWeight: 700 }}>{stock[stockTarget.id] ?? 0}</span>
            <br />増減で記録します（入荷は正の数・返品や破損は負の数）。棚卸しによる置き換えは在庫ページで行います。
          </p>
          <div className="nox-field">
            <span className="lab">増減<span className="req">*</span></span>
            <input type="number" inputMode="numeric" value={stDelta}
              onChange={(e) => setStDelta(Number(e.target.value))} style={inputLg} />
            <span className="hint">
              記録後の在庫 <span style={t.num}>{(stock[stockTarget.id] ?? 0) + stDelta}</span>
            </span>
          </div>
          <div className="nox-field">
            <span className="lab">理由</span>
            <input placeholder="入荷・棚卸 など（任意）" value={stReason}
              onChange={(e) => setStReason(e.target.value)} style={inputLg} />
          </div>
          <div className="nox-formmodal-foot">
            <button style={btnPrimaryLg} disabled={!stDelta || busyId === stockTarget.id} onClick={addStock}>記録する</button>
          </div>
        </Modal>
      )}

      {isManagerUp && modalOpen && (
        <Modal onClose={closeModal} maxWidth={680} scroll>
          <div className="nox-formmodal-head">
            <strong>{pId ? "商品を編集" : "商品を追加"}</strong>
            <button type="button" className="nox-formmodal-x" onClick={closeModal} aria-label="閉じる">×</button>
          </div>

          {/* ★④b-3: 縦積み（ラベル→入力→補足）。ラベルと欄の対応を読み取れるようにする。 */}
          <div className="nox-field">
            <span className="lab">会計区分<span className="req">*</span></span>
            {/* ★編集時はロック。塞いでいるのは UI だけで、DB は通す＝mig0069 の UPDATE 分岐が
                `set type = p_type` で無条件に上書きする（0069:86 で確認済み）。RPC は変更しない方針の
                ため、この非対称をここに記録しておく。過去の会計データは check_lines.kind に
                凍結済みなので遡っては動かない（動くのは以後の分）。 */}
            <SegSelect value={pType} onChange={(v) => setPType(v)}
            options={[["drink", "ドリンク"], ["champ", "シャンパン"], ["bottle", "ボトル"]] as const} disabled={pId !== null} />
            {/* ★④b-4: 状態別に出し分ける（2文を連結しない）。編集時は変更できないのだから
                「変えると何が起きるか」は要らない＝要るのは次の一手（新規登録）の案内。 */}
            <span className="hint">
              {pId === null
                ? "バック計算・日報の売上区分・キャストドリンク申請の可否を決めます。登録後は変更できません。"
                : "登録後は変更できません。変更が必要な場合は、新しい商品として登録してください。"}
            </span>
          </div>

          <div className="nox-field">
            <span className="lab">表示カテゴリ</span>
            {/* 純増⑦（mig0063）: カテゴリ（未分類＝null）。無効カテゴリは現在値のときだけ選択肢に残す。 */}
            <select value={pCatId} onChange={(e) => setPCatId(e.target.value)} style={inputLg}>
              <option value="">未分類</option>
              {categories.filter((c) => c.is_active || c.id === pCatId).map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.is_active ? "" : "（無効）"}</option>
              ))}
            </select>
            <span className="hint">レジ画面での並び分類です。いつでも変更できます。</span>
          </div>

          <div className="nox-field">
            <span className="lab">商品名<span className="req">*</span></span>
            <input placeholder="例 芋焼酎" value={pName} onChange={(e) => setPName(e.target.value)} style={inputLg} />
          </div>

          <div className="nox-field">
            <span className="lab">販売価格<span className="req">*</span></span>
            <input type="number" inputMode="numeric" min={0} value={pPrice}
              onChange={(e) => setPPrice(Number(e.target.value))} style={inputLg} />
          </div>

          {/* 詳細（原価/発注点/バック設定/unit4/本指名pt）＝日常運用では触らない項目をここへ寄せた */}
          <button type="button" onClick={() => setDetailOpen((v) => !v)}
            style={{ ...btnLight, marginTop: 4, marginBottom: 4, fontSize: 12.5 }}>
            {detailOpen ? "▾ 詳細（原価・発注点・バック）" : "▸ 詳細（原価・発注点・バック）"}
          </button>
          {/* ★E4 群2b: 下の沈み面は手組み inline → 新部品 .nox-inset（gaps G2 の裁定で新設）。
              下 padding だけは元の 2px を保つ（中の .nox-field が margin-bottom 15px を持つため）。 */}
          {detailOpen && (
            <div className="nox-inset" style={{ marginTop: 12, paddingBottom: 2 }}>
              <div className="nox-field2">
                <div className="nox-field">
                  <span className="lab">原価</span>
                  <input type="number" inputMode="numeric" min={0} value={pCost}
                    onChange={(e) => setPCost(e.target.value)} placeholder="任意" disabled={costsError} style={inputLg} />
                </div>
                {/* 純増①（mig0062）: 発注点。空欄＝しきい無し（在庫バー非表示）＝null 送信 */}
                <div className="nox-field">
                  <span className="lab">発注点</span>
                  <input type="number" inputMode="numeric" min={0} value={pReorder}
                    onChange={(e) => setPReorder(e.target.value)} placeholder="空欄＝しきい無し" style={inputLg} />
                </div>
              </div>

              <div className="nox-field">
                <span className="lab">バックの決め方</span>
                <SegSelect value={pBackMode} onChange={(v) => setPBackMode(v)}
            options={[["rate", "率%（販売価格に対する割合）"], ["unit4", "指名別単価（4段階）"]] as const} />
              </div>

              {pBackMode === "rate" ? (
                <div className="nox-field">
                  <span className="lab">バック率（%）</span>
                  <input type="number" inputMode="numeric" min={0} value={pBackValue}
                    onChange={(e) => setPBackValue(Number(e.target.value))} style={inputLg} />
                </div>
              ) : (
                // ★④b-3: unit4 は 2×2 のグリッド＝ラベルと欄の対応を明確にする（旧: 横一列4つ）。
                <div className="nox-field2">
                  {([["hon", "本指名"], ["jonai", "場内指名"], ["dohan", "同伴"], ["free", "フリー"]] as const).map(([k, label]) => (
                    <div className="nox-field" key={k}>
                      <span className="lab">{label}（円）</span>
                      <input type="number" inputMode="numeric" min={0} value={pUnit4[k] ?? 0}
                        onChange={(e) => setPUnit4((u) => ({ ...u, [k]: Number(e.target.value) }))} style={inputLg} />
                    </div>
                  ))}
                </div>
              )}

              <div className="nox-field">
                <span className="lab" style={{ opacity: pExempt ? 0.45 : 1 }}>本指名pt</span>
                <input type="number" inputMode="numeric" min={0} value={pExempt ? 0 : pHonPt} disabled={pExempt}
                  onChange={(e) => setPHonPt(Number(e.target.value))}
                  style={{ ...inputLg, opacity: pExempt ? 0.45 : 1 }} />
              </div>

              {/* キャストドリンク（mig0066/0069/0070）＝按分除外。ON の行は check_close の指名按分を通らず、
                  バックは drink_claims 経路（レジの「キャストに付ける」）だけで帰属する＝経路が排他。
                  ★hon_pt は 0 に強制する（CHECK products_exempt_hon_pt_chk）＝按分ループを通らない商品は
                    本指名ptの分配経路も持たないため、値を持ったまま除外指定すると pt が黙って消える。 */}
              <div className="nox-field">
                <label style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={pExempt} style={{ width: 18, height: 18 }}
                    onChange={(e) => { setPExempt(e.target.checked); if (e.target.checked) setPHonPt(0); }} />
                  キャストドリンク（按分除外）
                </label>
                {pExempt && (
                  <span className="hint">
                    キャストドリンクは本指名ptを持てません（0 で保存されます）。バックはレジで「キャストに付ける」と確定します。
                  </span>
                )}
              </div>
            </div>
          )}

          {/* 有効スイッチと保存は常時（段G: canonical スイッチ・状態と挙動は不変）。
              ★④b-2/④b-3: モーダル下端に貼り付ける（position:sticky）＝「詳細」を開いて中身が伸びても
                 保存ボタンが常に見える。カード自身がスクロール容器（Modal の scroll オプション）。 */}
          <div className="nox-formmodal-foot">
            <div style={{ display: "flex", gap: 10, alignItems: "center", width: "100%", flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <button type="button" className={`nox-switch ${pActive ? "on" : ""}`} onClick={() => setPActive(!pActive)} aria-pressed={pActive} aria-label="有効"><i /></button>
                有効
              </span>
              {pId && <button style={btnLight} onClick={() => { setPId(null); setPName(""); setPReorder(""); setPCatId(""); setDetailOpen(false); }}>新規に戻す</button>}
            </div>
            {costsError && <span style={{ fontSize: 12, color: "var(--bad)", width: "100%" }}>原価を読み込めませんでした。再読込してください</span>}
            {/* ★④b-3: 主ボタンは横幅いっぱい。新規のときだけ「登録して続けて入力」を併置する。 */}
            <button style={btnPrimaryLg} disabled={costsError} onClick={() => saveProduct(false)}>{pId ? "更新" : "登録"}</button>
            {!pId && (
              <button style={btnGhostLg} disabled={costsError} onClick={() => saveProduct(true)}>登録して続けて入力</button>
            )}
          </div>
        </Modal>
      )}

      {/* ⑤一括登録（裁定J・mig0080 product_bulk_insert）。BANZEN BulkMenuModal の翻訳。 */}
      {isManagerUp && bulkOpen && (
        <BulkProductModal
          storeId={storeId}
          categories={categories}
          existingNames={products.map((p) => p.name)}
          onClose={() => setBulkOpen(false)}
          onSaved={async (m) => { setBulkOpen(false); setMsg(m); await reload(); }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑤一括登録モーダル（裁定J）。CSV/表ペースト → 純関数パース（lib/nox/product-bulk）→
//   プレビュー → client 直 product_bulk_insert（0080・原子的＝部分成功なし）。
// ★保存をブロックするのは「パースエラー」と「停止中カテゴリとの同名衝突」の2つだけ。
//   同名商品は警告のみ（DB に unique が無く、実際に同名運用がありうるため）。
// ★文字コード問題は構造的に発生しない（ファイル読込ではなく貼り付け＝ブラウザが文字列で渡す）。
// ─────────────────────────────────────────────────────────────────────────────
function BulkProductModal({
  storeId, categories, existingNames, onClose, onSaved,
}: {
  storeId: string;
  categories: Category[];
  existingNames: string[];
  onClose: () => void;
  onSaved: (msg: string) => Promise<void> | void;
}) {
  const supabase = createClient();
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(() => parseProductBulk(text), [text]);
  const dups = useMemo(() => duplicateWarnings(parsed.items, existingNames), [parsed.items, existingNames]);
  const conflicts = useMemo(
    () => checkInactiveCategoryConflicts(parsed.categories, categories),
    [parsed.categories, categories],
  );
  const newCats = useMemo(() => newCategories(parsed.categories, categories), [parsed.categories, categories]);
  const byType = useMemo(() => countByType(parsed.items), [parsed.items]);

  // カテゴリごとにグループ化（プレビュー用。未分類は末尾）
  const groups = useMemo(() => {
    const m = new Map<string, ProductBulkItem[]>();
    for (const i of parsed.items) {
      const k = i.category === "" ? "__none" : i.category;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(i);
    }
    const out = [...m.entries()].filter(([k]) => k !== "__none");
    if (m.has("__none")) out.push(["__none", m.get("__none")!]);
    return out;
  }, [parsed.items]);

  const canSave = text.trim() !== "" && parsed.errors.length === 0 && parsed.items.length > 0 && conflicts.length === 0;

  async function submit() {
    setErr(null);
    if (!canSave) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("product_bulk_insert", {
      p_store_id: storeId,
      p_items: parsed.items.map((i) => ({
        category: i.category, name: i.name, type: i.type, price: i.price, cost: i.cost,
      })),
    });
    setBusy(false);
    if (error) {
      // RPC は短い英字トークンで返す（行番号は client パーサ担当）＝日本語に翻訳して出す
      const m = error.message;
      setErr(
        m.includes("duplicate name") ? "停止中のカテゴリと同名のカテゴリがあります。再有効化するか別名にしてください。"
        : m.includes("too many items") ? "商品が多すぎます（300件まで）。"
        : m.includes("too many categories") ? "カテゴリが多すぎます（30件まで）。"
        : m.includes("forbidden") ? "権限がありません。"
        : m,
      );
      return;
    }
    const j = (data ?? {}) as { products_created?: number; categories_created?: string[] };
    const nc = (j.categories_created ?? []).length;
    await onSaved(`商品${j.products_created ?? parsed.items.length}件を登録しました${nc > 0 ? `（新規カテゴリ${nc}件）` : ""}`);
  }

  return (
    <Modal onClose={onClose} maxWidth={620} scroll>
      <div className="nox-formmodal-head">
        <strong>商品を一括登録</strong>
        <button type="button" className="nox-formmodal-x" onClick={onClose} aria-label="閉じる">×</button>
      </div>
      <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--sub)", lineHeight: 1.7 }}>
        1行に1商品。列は「<strong>表示カテゴリ, 商品名, 会計区分, 価格, 原価</strong>」（原価は省略可）。
        カンマ区切り・表からの貼り付け（タブ区切り）どちらも使えます。
        会計区分は「ドリンク / シャンパン / ボトル」。カテゴリ空欄は未分類になります。
        <br />バック設定と発注点は登録後に商品ごとに設定してください（一括では既定値で入ります）。
      </p>

      <div className="nox-field">
        <span className="lab">CSV / 表の貼り付け</span>
        <textarea
          className="nox-input" rows={7} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={"グラス,ハイボール,ドリンク,800,200\nボトル（焼酎）,黒霧島,ボトル,12000,4000\nシャンパン,モエ,シャンパン,30000,9000"}
          style={{ ...inputLg, resize: "vertical", fontFamily: "inherit", lineHeight: 1.7 }}
        />
      </div>

      {parsed.errors.length > 0 && (
        <div style={{ ...t.alert, background: "rgba(220,80,80,.10)", maxHeight: 120, overflowY: "auto", margin: "10px 0" }}>
          {parsed.errors.slice(0, 8).map((e, i) => <div key={i} style={{ fontSize: 12.5, color: "var(--bad)" }}>{e}</div>)}
          {parsed.errors.length > 8 && <div style={{ fontSize: 12.5, color: "var(--bad)" }}>…ほか {parsed.errors.length - 8} 件</div>}
        </div>
      )}

      {/* ★停止中カテゴリとの同名衝突＝保存前ブロック（DB の unique(store_id, lower(name)) に当たる） */}
      {conflicts.length > 0 && (
        <div style={{ ...t.alert, background: "rgba(220,80,80,.10)", margin: "10px 0" }}>
          {conflicts.map((c) => (
            <div key={c} style={{ fontSize: 12.5, color: "var(--bad)" }}>
              停止中のカテゴリ「{c}」と同名です。再有効化するか別名にしてください。
            </div>
          ))}
        </div>
      )}

      {dups.length > 0 && (
        <div style={{ ...t.alert, margin: "10px 0", fontSize: 12.5 }}>
          同名の商品があります（登録はブロックしません）:{" "}
          {dups.slice(0, 5).map((d) => `${d.name}（${d.count}件）`).join("・")}
          {dups.length > 5 && ` ほか${dups.length - 5}件`}
        </div>
      )}

      {/* プレビュー: カテゴリごとグループ・新規バッジ・★会計区分ごとの件数サマリ（裁定J） */}
      <div style={{ ...card, padding: "10px 12px", margin: "10px 0 0" }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--sub)", marginBottom: 6 }}>
          プレビュー　カテゴリ <span style={t.num}>{parsed.categories.length}</span>・
          商品 <span style={t.num}>{parsed.items.length}</span> 件
          {newCats.size > 0 && <span style={{ marginLeft: 8 }}>（新規カテゴリ {newCats.size} 件）</span>}
        </div>
        {parsed.items.length > 0 && (
          <div style={{ fontSize: 11.5, color: "var(--sub)", marginBottom: 8 }}>
            {(["drink", "champ", "bottle"] as const).map((k) => (
              <span key={k} style={{ marginRight: 12 }}>
                {BULK_TYPE_LABEL_JA[k]} <span style={{ ...t.num, color: "var(--ink)", fontWeight: 700 }}>{byType[k]}</span>
              </span>
            ))}
          </div>
        )}
        {parsed.items.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--v2-muted)" }}>ここに登録内容が表示されます。</div>
        ) : (
          <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
            {groups.map(([cat, list]) => (
              <div key={cat}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700 }}>
                  {cat === "__none" ? <span style={{ color: "var(--sub)" }}>未分類</span> : cat}
                  {cat !== "__none" && newCats.has(cat) && (
                    <span className="nox-catbadge" style={{ fontSize: 10 }}>新規</span>
                  )}
                  <span style={{ color: "var(--sub)", fontWeight: 400 }}>{list.length}品</span>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--sub)", lineHeight: 1.9, paddingLeft: 8 }}>
                  {list.map((i, ix) => (
                    <span key={ix} style={{ marginRight: 10, whiteSpace: "nowrap" }}>
                      {i.name} <span style={t.num}>{yen(i.price)}</span>
                      <span style={{ color: "var(--v2-muted)" }}>/{BULK_TYPE_LABEL_JA[i.type]}</span>
                      {i.cost != null && <span style={{ color: "var(--v2-muted)" }}>（原価{yen(i.cost)}）</span>}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {err && <p style={{ fontSize: 12.5, color: "var(--bad)", margin: "10px 0 0" }}>{err}</p>}

      <div className="nox-formmodal-foot">
        <button style={btnGhostLg} onClick={onClose}>キャンセル</button>
        <button style={btnPrimaryLg} disabled={!canSave || busy} onClick={() => void submit()}>
          {busy ? "登録中…" : `${parsed.items.length} 件を登録`}
        </button>
      </div>
    </Modal>
  );
}
