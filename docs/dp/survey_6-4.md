# 未実測 6-4 の実測 — 「shifts から shift_wishes を辿れるか」

読み取り専用調査（2026-08-28）。**裁定はしない**。dev DB = mig0001〜0110。

## 結論（3行）

1. **辿れる。DB・RPC・UI の3層すべてで既に実装済み**＝`shifts.wish_id uuid NULL` ＋
   `shifts_wish_id_fkey FOREIGN KEY (wish_id) REFERENCES shift_wishes(id)` が実在し、
   `shift-board.tsx` は 4箇所で `s.wish_id → shift_wishes` を実際に引いて「申請時間」を出している。
2. よって 6-4 は**「未実測」ではなく「実装済みだが台帳が追随していない」**項目。新規開発は要らない。
3. ただし **`shift-board.tsx` に「shifts は wish_id を保持していない」と書いた古いコメントが2箇所残存**
   （L204・L1921）。同ファイル内で L30/L294/L746 の実装と**正面から矛盾**しており、
   これを読んで設計判断すると「対比は作れない」と誤読する（教訓40 の語 vs 中身の型）。

## 根拠 A: DB（catalog 実測・データ非参照）

```sql
select column_name, data_type, is_nullable from information_schema.columns
 where table_schema='public' and table_name='shifts' order by ordinal_position;   -- 14 行
select con.conname, pg_get_constraintdef(con.oid) from pg_constraint con
 join pg_class rel on rel.oid=con.conrelid join pg_namespace n on n.oid=rel.relnamespace
 where n.nspname='public' and rel.relname='shifts' and con.contype='f';           -- 6 行
```

`shifts` 14列のうち関連は:

| 列 | 型 | NULL |
|---|---|---|
| `wish_id` | uuid | **YES**（手動追加行は null） |
| `source` | text | NO |
| `period_id` | uuid | YES |
| `status` | text | NO |

外部キー **6本**中、辿りに使うのは `shifts_wish_id_fkey → shift_wishes(id)`。
`shift_wishes` は 12列（`decided_by` / `decided_at` を持つ＝承認の記録側）。

**逆向き（wishes → shifts）の FK は無い**。辿りは常に `shifts` 側からの単方向。

## 根拠 B: RPC（`pg_proc.prosrc` に `wish_id` を含む関数＝5本）

```
shift_auto_apply(uuid,uuid[])     shift_auto_clear(uuid)     shift_remove(uuid)
shift_wish_decide(uuid,boolean)   shift_wish_withdraw(uuid)
```

`shift_wish_decide` は accept 時に `shifts` を作って `wish_id` を書き、
`shift_remove` / `shift_auto_clear` は削除時に wish を `pending` へ戻す（裁定D）。
＝**書き手と戻し手が対で存在する**。

## 根拠 C: app 側の参照経路（grep 実測）

| 箇所 | 内容 |
|---|---|
| `shift-board.tsx:30` | `type Shift` に `wish_id: string \| null` |
| `shift-board.tsx:294` / `:438` | `select(... , wish_id, source, period_id)` |
| `shift-board.tsx:746` | 「申請時間」の説明＝`shifts.wish_id → shift_wishes`（SD-1 の原型対比） |
| `shift-board.tsx:871` / `:1145` / `:1659` / `:1835` | `s.wish_id ? wishAll.find(x => x.id === s.wish_id)` ＝**実際の突き合わせ4箇所** |
| `mine/wishes/withdraw-button.tsx:15` | `shift_wish_withdraw` |
| `seed-f0.ts:97` | 削除順が `shifts` → `shift_wishes`（wish_id FK のため）＝FK の存在を運用側も前提化 |

## 残っている齟齬（要処理・本調査では直さない）

- `shift-board.tsx:204` … 「★『元の希望との対比』は**入れない**＝`shifts` が希望の原型（wish_id）を保持していないため」
- `shift-board.tsx:1921` … 「★『元の希望との対比』と『メモ』は入れない＝`shifts` が wish_id もメモ列も持たないため」

**wish_id については両方とも現状と反する**（mig0101 で列が入り UI も結線済み）。
一方**「メモ列」の部分は正しい**（`shifts` にも `shift_wishes` にもメモ列は無い＝上の12列/14列で確認）。
＝**1文の中に生きている記述と死んでいる記述が混在**しているため、消すのではなく分けて書き直す必要がある。
