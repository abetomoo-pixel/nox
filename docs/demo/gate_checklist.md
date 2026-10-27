# ローンチ前のゲート一覧（2026-10-27 作成・相談役の指示）

項目ごとに 状態／担当（Agoora か CC）／残りの作業 を 1 行。状態が変わったらこの表を直す（台帳にも 1 行）。

| 項目 | 状態 | 担当 | 残りの作業 |
|---|---|---|---|
| PITR（7 日） | 未（無効） | Agoora | お客様の店を入れる直前に Supabase で有効化（7 日）。有効化したらこの行を「済」に |
| Stripe live（Price ID） | 未（テストモード） | Agoora | live の Price ID を作って env に設定→CC が本番の請求の流れを live で確認 |
| 規約 v1.0 | 未確定 | Agoora（弁護士） | 弁護士 L8〜L12 の回答待ち→回答を受けて規約 v1.0 を確定・画面の同意を v1.0 に |
| T11／T17（源泉の区分・日次精算） | 調査回答（10/27）・中居先生に確認中 | Agoora | 税理士の返事で違いが出たら裁定434 のその点だけ改める（docs/expert/t11_t17_research_20261027.md） |
| T20（その他 204 条の 1 回の支払の数え方） | 未回答 | Agoora（税理士） | 回答まで NOX は月次 run の課税額で判定（裁定434・Agoora 確定 10/27（2）） |
| T15（現金割引と税・サの計算順） | 未回答 | Agoora（税理士） | 回答まで既定＝合計から（仮置き）・0187 の便 CASH で 2 方式を用意 |
| Auth の設定 | 未確認 | Agoora | Supabase Auth（メールの送信元・リダイレクト URL・回数上限）を本番の値で確認 |
| テスト店舗の印 | 未 | CC（＋Agoora 確認） | NOX-VERIFY／デモの org を本番の一覧・請求・集計から外す印の方式を決めて実装 |
| CI（GitHub Actions） | 赤（原因判明） | CC | 「Verify (pure suites)」の verify:nox-punch-match が DB 段 (9)（0154）で SUPABASE_DB_URL を要求＝env が無い CI で止まる。直し＝env が無いときだけ (9) を SKIP か DB 段を別 suite へ（便 M2 の後）。runs-on は ubuntu-24.04 に固定済み |
| cron（5 系統） | 稼働中（shift-periods-close は 10/27 登録） | Agoora（登録）／CC（確認） | demo-reset 6 本（06:05〜06:15）・purge（05:15）・retry（06:35）・auto-confirm（15 分ごと）・shift-periods-close（06:20）。10/28 06:20 以降の net._http_response を次のセッションの起動確認で見る |
| verify:ui-tokens | 既存の失敗 61 件（f0 外） | CC | baseline 外の色リテラル／未定義トークン 61 件。ローンチ前に 0 にするかは後で判断（今は直さない） |

録画・LP＝システム完成後の最終工程（docs/demo/lp_script_20261026.md は台本のまま据え置き）。
