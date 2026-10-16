# migration の構文検査（恒久注意30・便 M173-fix・2026-10-16）

手貼り前に migration の構文を機械で検査する手順。本番には触れない（ローカルの使い捨て Postgres＋libpg_query）。
根拠＝0173 の初回手貼り（2026-10-16）で `ERROR 42601: unexpected end of function definition at end of input（LINE 2042: end $function$;）`。
原因＝生成器 gen_0173.mjs の置換が bottle_keep_register の `values (…, 'active', now(), p_note,` という**行の途中で終わる anchor** に `-- ★5 …` コメントを足した＝同じ行の残り（`p_remaining_pct, …, p_check_line_id)`）がコメントになり、insert 文が閉じないまま `$function$` に達した。ドル引用タグ自体はずれていない（24 本×2 で対応）。

## 1. 道具

| 道具 | 何を見るか | 入れ方 |
|---|---|---|
| libpg_query（npm `libpg-query@17`・wasm・ネイティブ build 不要） | ファイル全体の SQL 段の parse＝文の区切り・ドル引用の対応・DDL の構文。CREATE FUNCTION の本体は文字列として通る＝**本体の中は見ない**。LANGUAGE sql の関数は本体だけ別に parse | `npm i libpg-query@17`（scratchpad など package.json の外でよい・`--pgq <dir>` で場所を渡す） |
| ローカル Postgres（scoop の postgresql・`initdb`→`pg_ctl start -p 54329`） | LANGUAGE plpgsql の関数を `CREATE FUNCTION` で実行＝本番と同じ plpgsql の検証器（check_function_bodies）が本体を parse。宣言部の複合型（public.kiosk_devices 等）は空のスタブ表で型解決だけ通す。表・列・関数の存在は実行時解決＝検査対象外 | `initdb -D pgdata -U postgres -E UTF8 --no-locale -A trust` → `pg_ctl -D pgdata -o "-p 54329" start` → `psql -h 127.0.0.1 -p 54329 -U postgres -c "create database noxcheck"` |

libpg_query の Node binding（libpg-query 13〜17）には plpgsql の parser（pg_query_parse_plpgsql）が無い＝本体の検査はローカル Postgres が要る。python の pglast（parse_plpgsql）は 3.14 に wheel が無く入らなかった。

## 2. 手順（1 本 1 分）

```bash
node scripts/mig-check.mjs supabase/migrations/0173_register_payment.sql --pgq <libpg-query を入れた dir> --db postgresql://postgres@127.0.0.1:54329/noxcheck
```

- `--db` は 127.0.0.1／localhost 以外を拒否する（本番に流さない）。全部 `BEGIN … ROLLBACK`・関数ごとに savepoint（1 本の失敗で後続を巻き込まない）。
- 出力＝`[1] libpg_query parse: ok（statements N）`／`[2] $function$ の対応: ok（M 本×2）`／`[2] plpgsql <name>: ok|NG <code> <message>（file line L〜）`／`[3] sql <name>: ok|NG`／最後に `OK（errors 0・plpgsql a・sql b）` か `NG n`。
- NG が 1 本でもあれば手貼りに出さない。直すのは生成器（mig を手で直さない＝再生成→再検査→sha を docs に反映）。

## 3. 検査の限界（分かっていること）

- 表・列・関数名の誤り（存在しない列・引数の型違い・overload の取り違え）は見えない＝実行時 or 手貼り時に出る。これまでどおり live DDL 照合（★新設 RPC は手貼り前に live DDL 照合）と検証クエリで補う。
- LANGUAGE sql 関数の本体は libpg_query の SQL parse だけ（表の存在は見ない）。
- 0173 の初回の型（行の途中のコメント）は生成器側の rep() にも guard を入れた（anchor が行の途中で終わり to の最終行にコメントがあるとき、同じ行の残りがコードなら生成を止める）。

## 4. 実績

| 日付 | 対象 | 結果 |
|---|---|---|
| 2026-10-16 | cbd89d1 の 0173（初回手貼りで 42601） | `[2] plpgsql bottle_keep_register: NG 42601 unexpected end of function definition at end of input`＝本番と同じエラーを再現 |
| 2026-10-16 | 修正後の 0173（2,781 行）／0174（613 行） | 両方 `OK（errors 0）`＝0173 plpgsql 22・sql 2／0174 plpgsql 5・sql 1 |
