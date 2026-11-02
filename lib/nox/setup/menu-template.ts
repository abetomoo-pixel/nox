// ★便 M6 メニューテンプレート（2026-11-02 夜・client のみ・DDL なし）＝docs/handoff/menu_templates の CSV（業態×価格帯・税込）から作った定数 templates/menu_v6.json を
//   初期設定 v5 の状態（V5State）に入れる純関数（DB・ブラウザを知らない）。決定（11/02）:
//   - 業態と価格帯で選ぶ。定番は ON・高額品／希少品は OFF で登録だけ（OFF の規則は生成器＝相談役確認待ち）。
//   - 料金システムとバックは確認するまで「この内容で始める」を押せない（tplConfirm の 2 つ）。
//   - 割りものは「無料にする」の 1 問と、全体の価格 ±% の調整（100 円単位に丸め）。
//   - テンプレートがない業態の代用＝ガールズバー→スナック・ラウンジ／バー→キャバクラ地方都市。
//   - 価格は税込＝取り込むと税は内税（tax "in"）に固定（調査 2：外税のままだと二重に乗る）。
import data from "./templates/menu_v6.json";
import type { V5Cat, V5Item, V5State, V5Type } from "./v5";

type TplItem = { n: string; p: number; type: string; keep: boolean; backPending: boolean; noBack: boolean; sub: string; on: boolean };
type Tpl = { key: string; type: string; band: string; pricing: { set?: { name: string; price: number; minutes: number }[]; extension?: { name: string; price: number; minutes: number }[]; vip?: { name: string; price: number; minutes: number }[]; hon?: number; jo?: number; dohan?: number }; menu: { cat: string; items: TplItem[] }[] };
const TPL = (data as unknown as { templates: Record<string, Tpl> }).templates;
const SUB = (data as unknown as { substitute: Record<string, string> }).substitute;

export type MenuTemplateKey = keyof typeof TPL & string;
export type TplConfirm = { pricing: boolean; backs: boolean };

/** 業態で選べるテンプレート（価格帯）＝キャバクラは 3 つ・それ以外は代用の 1 つ */
export function menuTemplatesFor(type: V5Type | null): { key: string; label: string; substitute: boolean }[] {
  if (!type) return [];
  const own = Object.values(TPL).filter((t) => (type === "cabaret" ? t.key.startsWith("cabaret_") : t.key === type));
  if (own.length) return own.map((t) => ({ key: t.key, label: `${t.type}・${t.band}`, substitute: false }));
  const k = SUB[type]; return k && TPL[k] ? [{ key: k, label: `${TPL[k].type}・${TPL[k].band}（代用）`, substitute: true }] : [];
}

/** 価格の ±% 調整（100 円単位・0 は 0 のまま） */
export const adjustPrice = (p: number, pct: number): number => (p <= 0 ? 0 : Math.max(100, Math.round((p * (1 + pct / 100)) / 100) * 100));

/** テンプレートを状態に入れる＝メニュー・料金（セット／延長／指名／場内／同伴／VIP）・税は内税。バックは 0（確認するまで開始不可）。mixFree＝割りものを 0 円・adjPct＝全体の価格 ±% */
export function applyMenuTemplate(s: V5State, key: string, opts: { mixFree: boolean; adjPct: number }): V5State & { tplKey: string; tplConfirm: TplConfirm } {
  const t = TPL[key]; if (!t) throw new Error(`no template ${key}`);
  const menu: V5Cat[] = t.menu.map((c) => ({ cat: c.cat, on: true, items: c.items.map((i): V5Item => ({
    n: i.n, p: /割りもの/.test(i.sub) || /割りもの/.test(c.cat) ? (opts.mixFree ? 0 : adjustPrice(i.p, opts.adjPct)) : adjustPrice(i.p, opts.adjPct),
    b: 0, bt: i.type === "champ" ? "pct" : "yen", keep: i.keep, on: i.on, byKind: false, bj: null, bf: null })) }));
  const n: V5State & { tplKey: string; tplConfirm: TplConfirm } = { ...s, menu, tax: "in", tplKey: key, tplConfirm: { pricing: false, backs: false } };
  const p = t.pricing;
  n.fees = { hon: p.hon ?? s.fees.hon, jo: p.jo ?? s.fees.jo, dohan: p.dohan ?? s.fees.dohan };
  if (p.set?.length && n.rules.length) {
    const first = p.set[0];
    const ext = (p.extension ?? []).map((e, i): [number, number, 0 | 1] => [e.minutes, adjustPrice(e.price, opts.adjPct), i === 0 ? 1 : 0]);
    n.rules = n.rules.map((r, i) => (i === 0 ? { ...r, set: adjustPrice(first.price, opts.adjPct), min: first.minutes, ext: ext.length ? ext : r.ext } : r));
  }
  if (p.vip?.length) n.vip = { ...s.vip, on: true, amt: adjustPrice(p.vip[0].price, opts.adjPct) };
  return n;
}

/** 「この内容で始める」を押せるか＝テンプレートを入れたなら料金システムとバックの確認が両方必要 */
export const tplStartBlockedOf = (s: { tplKey?: string; tplConfirm?: TplConfirm }): string | null =>
  s.tplKey && !(s.tplConfirm?.pricing && s.tplConfirm?.backs) ? "テンプレートの料金システムとキャストのバックを確認してから始めます（確認の印を 2 つ付けてください）" : null;
