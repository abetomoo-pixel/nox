// ★0203（2 号店の段 1・相談役 21:40 の ■2-a・b）: 店を足す・設定の写しの語（DB を知らない純関数）。
export const STORE_COPY_PARTS = ["pricing", "products", "comp", "settings", "hours"] as const;
export type StoreCopyPart = (typeof STORE_COPY_PARTS)[number];
/** 写すものの名前と中身（画面の札） */
export const STORE_COPY_LABEL: Record<StoreCopyPart, { name: string; what: string }> = {
  pricing: { name: "料金のルール", what: "料金の区分とルール・指名料のランク・サービス料・セットと延長・丸め" },
  products: { name: "商品", what: "商品とカテゴリ・バックの率" },
  comp: { name: "待遇", what: "待遇プランと部品・自由設計のバック・ノルマと罰の設定・体入の条件・制度の ON／OFF" },
  settings: { name: "店舗設定", what: "税と請求・領収書・支払方法・打刻の方法と丸め・送り・マイページなど（Wi-Fi・位置・LINE・端末を除く）" },
  hours: { name: "営業時間と定休日", what: "曜日ごとの営業時間と定休日・営業日の切替時刻" },
};
/** 写さないもの（画面の 1 行） */
export const STORE_COPY_NEVER = "キャスト・スタッフ・顧客・ボトル・売掛・伝票・勤怠・給与・日報・席・必要人数・臨時の日・Wi-Fi・位置・端末・LINE は写しません。";
/** 初期設定の確定の手順の群（v5 の step.group）＝写した part の群は飛ばす */
export const PART_GROUP: Record<StoreCopyPart, string> = { pricing: "pricing", products: "products", comp: "comp", settings: "settings", hours: "hours" };
export function storeAddErrJa(msg: string | null | undefined): string {
  const m = msg ?? "";
  if (/forbidden \(demo\)/.test(m)) return "デモの会社には足せません";
  if (/forbidden/.test(m)) return "運営者として確かめられませんでした";
  if (/dup store/.test(m)) return "同じ名前の店があります";
  if (/bad name/.test(m)) return "店名を入れてください（40 字まで）";
  if (/bad biz type/.test(m)) return "業態を選んでください";
  if (/copy from not ready/.test(m)) return "写し元の店の初期設定が済んでいません";
  if (/bad copy from|bad parts/.test(m)) return "写すものの選び方が違います";
  if (/not found/.test(m)) return "会社が見つかりません";
  return "店を足せませんでした。時間をおいてもう一度お試しください";
}
/** 写しの関数（store_copy_settings）の語 */
export function storeCopyErrJa(msg: string | null | undefined): string {
  const m = msg ?? "";
  if (/not empty: (\w+)/.test(m)) { const p = /not empty: (\w+)/.exec(m)![1] as StoreCopyPart; return `${STORE_COPY_LABEL[p]?.name ?? p}はもう入っています（二重に写しません）`; }
  if (/src not ready/.test(m)) return "写し元の店の初期設定が済んでいません";
  if (/dst done/.test(m)) return "この店の初期設定は確定済みです";
  if (/forbidden/.test(m)) return "オーナーだけが写せます";
  return "1 店目から写せませんでした";
}
