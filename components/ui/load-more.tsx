"use client";

// ★便 M5b M-60（2026-11-02）: 一覧の「さらに表示」の共通部品（顧客・スタッフ 50 件／キャストのカード 24 件）。
//   絞り込み・検索・並び替えは呼び出し側が全件に掛けてから渡す（表示中の分だけを絞らない）。resetKey（絞り込みの条件）が変わったら表示数を最初の数に戻す。
//   件数は「50 / 230 件」の形。全件が見えていればボタンは出さない。DB の読み足しはしない（全件読みのままの一覧だけに使う＝M-60 の調査）。
import { useEffect, useState } from "react";
import * as t from "@/lib/nox/ui/theme";

export function useLoadMore<T>(items: readonly T[], pageSize: number, resetKey: string): { shown: T[]; total: number; count: number; more: () => void; hasMore: boolean } {
  const [count, setCount] = useState(pageSize);
  useEffect(() => { setCount(pageSize); }, [resetKey, pageSize]);
  const n = Math.min(count, items.length);
  return { shown: items.slice(0, n), total: items.length, count: n, more: () => setCount((c) => c + pageSize), hasMore: n < items.length };
}

export function LoadMoreBar({ count, total, hasMore, more, unit = "件", testId }: { count: number; total: number; hasMore: boolean; more: () => void; unit?: string; testId?: string }) {
  if (total === 0) return null;
  return (
    <div className="nox-loadmore" data-load-more={testId ?? "1"} data-load-more-count={`${count}/${total}`}>
      <span className="num" style={{ fontSize: 12, color: "var(--sub)" }}>{count} / {total} {unit}</span>
      {hasMore && <button type="button" style={{ ...t.btnGhost, ...t.btnSm }} onClick={more}>さらに表示</button>}
    </div>
  );
}
