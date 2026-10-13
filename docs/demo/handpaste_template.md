# 手貼り案内のテンプレ（Agoora 向け・便 W5-2a で定型化・2026-10-13）

handpaste_NNNN.md は本テンプレの構成で書く（0163〜0170 の実例と同じ）。角括弧のプレースホルダは残さない（教訓104）。

```markdown
# NNNN 手貼り案内（Agoora 向け・YYYY-MM-DD・便 X 起草＝裁定 N）

**結論 3 行**
1. 本番 ref **hiqbfagmkrdpmlqhkmsu** の SQL Editor に `supabase/migrations/NNNN_name.sql` の全文を貼って Run（1 本だけ・所要 1 分）。**直前の mig の後**に貼る。
2. 中身＝（1 文で・何の器か・既存データの読み替えの有無）。
3. Success 後に §3 の検証クエリを貼り、**返った値（形）を CC へ貼る**。

## 1. 貼る前に

| 確認 | 期待 |
|---|---|
| アドレスバー | `https://supabase.com/dashboard/project/hiqbfagmkrdpmlqhkmsu/sql/new` |
| ファイル | supabase/migrations/NNNN_name.sql（HEAD の現物） |
| sha256 | 64 桁（バイト数・行数・LF） |
| 順序 | 直前の mig（適用済み日時）の後 |

ファイルは `begin;`〜`commit;` の単一トランザクション。途中で失敗すれば全部ロールバックされ DB は無傷。エラーが出たら**再実行せず**、エラー文をそのまま CC へ。

★デモとの順序: （NOT NULL 列が増えるときは payload の先行投入と push→Vercel success の後に reset する旨）

## 2. 貼る

1. SQL Editor の新規タブに全文（冒頭コメントから `-- ===== end NNNN =====` まで）を貼る。
2. Run。右下に Success が出たら時刻（JST）を控える。

## 3. 検証クエリ（Success の後に 1 つずつ・値ではなく形を見る）

（先頭に貼り先証明 `select 'nox-project-proof', count(*) from public.orgs;` ＝ 9・以下 mig ヘッダの検証クエリと同じ）

返すもの: N 行の結果（値は形どおりか）＋ Success 時刻。CC が live 照合→名簿・pin→結線→f0 2 連→push→reset。

**Success 表示は適用の証明にならない（恒久注意28）＝上の検証クエリの返り値（値の形）を貼ってから次便を出す。1 行でも形が違えば未適用として CC が停止する。**
```

末尾の太字 1 文は固定（恒久注意28＝0169 で「Success 確認済み」の申告が未適用だった実例）。
