"use client";

// 段B タップ注文の連打束ね（register-board / kiosk-register 共有・presentation-only 2026-07-24）。
// 契約:
//  - 同一商品タイルの連打を 700ms 束ねて check_add_line(p_qty=N) を 1回だけ呼ぶ（1行 qty=N）。
//  - タイル上の楽観バッジ（pending）は pre-commit の表示・明細行は commit 済＝別状態＝二重計上しない。
//  - flush は「直列」＝in-flight promise チェーンに繋ぐ＝同一 check への check_add_line/check_recalc は
//    高々1本 in-flight（DB 同時実行の競合を構造的に消す）。権威はサーバ（total 再計算はサーバ内）。
//  - flush 条件＝700ms タイマー満了 / 別商品タップ / money 系アクション（呼び出し側が await flush） / unmount。
//  - flush() は Promise<boolean> を返す＝呼び出し側 money アクションはこれが false なら本体処理を中止する。
import { useCallback, useEffect, useRef, useState } from "react";

const FLUSH_MS = 700;

type Pending = { productId: string; count: number };
export type TapBatch = {
  /** タイル productId の楽観バッジ数（0 なら非表示） */
  badgeOf: (productId: string) => number;
  /** タップ＝+1（同一なら束ね・別商品なら前を flush・700ms タイマー再アーム） */
  tap: (productId: string) => void;
  /** 保留を今すぐ commit。保留なし＝true（待つべき自分の commit が無い）。
   *  保留あり＝その commit の成否を返す（false＝呼び出し側 money アクションは中止すべき）。 */
  flush: () => Promise<boolean>;
};

export function useTapBatch(
  commit: (productId: string, qty: number) => Promise<{ error: { message?: string } | null }>,
  reload: () => Promise<void> | void,
  onError: (msg: string) => void,
): TapBatch {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(pending);
  pendingRef.current = pending;
  const commitRef = useRef(commit); commitRef.current = commit;
  const reloadRef = useRef(reload); reloadRef.current = reload;
  const onErrorRef = useRef(onError); onErrorRef.current = onError;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<Promise<unknown>>(Promise.resolve());
  const mountedRef = useRef(true);

  const clearTimer = () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };

  const flush = useCallback((): Promise<boolean> => {
    clearTimer();
    const p = pendingRef.current;
    if (!p) {
      // 保留なし＝待つべき自分の commit は無い。進行中チェーンの完了だけ待って true。
      return inFlightRef.current.then(() => true, () => true);
    }
    setPending(null); // バッジは commit 開始時に解除（pre-commit → commit へ引き渡す＝二重計上しない）
    const job = inFlightRef.current.then(async (): Promise<boolean> => {
      try {
        const { error } = await commitRef.current(p.productId, p.count);
        if (error && mountedRef.current) onErrorRef.current(error.message ?? "追加に失敗しました");
        if (mountedRef.current) await reloadRef.current(); // 成否に関わらずサーバ真実へ再同期
        return !error;
      } catch {
        return false;
      }
    });
    // 次の flush が待てるようチェーンを進める（boolean は伝播させず常に解決＝過去の失敗で永久ブロックしない）
    inFlightRef.current = job.then(() => undefined, () => undefined);
    return job;
  }, []);

  const tap = useCallback((productId: string) => {
    const p = pendingRef.current;
    if (p && p.productId !== productId) void flush(); // 別商品＝前の保留を先に flush（単一 pending 不変）
    setPending((cur) => (cur && cur.productId === productId ? { productId, count: cur.count + 1 } : { productId, count: 1 }));
    clearTimer();
    timerRef.current = setTimeout(() => { void flush(); }, FLUSH_MS);
  }, [flush]);

  useEffect(() => () => {
    // unmount（画面遷移）＝保留を fire-and-forget で commit。
    // ★限界: 遷移中に network 失敗するとこの1バーストは無通知で落ちる（post-unmount は setState/reload しない）。
    //   money アクションは必ず上の flush ゲートを通るため、実害は「次回この伝票を開いた時に追加漏れに気付く」に収まる。
    mountedRef.current = false;
    clearTimer();
    const p = pendingRef.current;
    if (p) void commitRef.current(p.productId, p.count);
  }, []);

  const badgeOf = useCallback(
    (productId: string) => (pending && pending.productId === productId ? pending.count : 0),
    [pending],
  );

  return { badgeOf, tap, flush };
}
