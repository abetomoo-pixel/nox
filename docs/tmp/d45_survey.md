# D45 入金方法別照合 着手前調査（2026-09-11 16:08〜 JST・読取のみ・HEAD 4a7f201・ahead 12）

live dump（pg 直結・proof orgs=3）＝`docs/tmp/d45_dump.txt`。何も変更していない。

## 2. 台帳の現状（逐語）

- 対応表 D45（`docs/dp/dp_v1_写像対応表_v1.md:568`）: 「| D45 | 回収方法の選択（現金／カード／その他） | RPC は3値受理（0055:96,194）・**UI は "cash" 固定** `:238`・ar_collected は cash のみ（0055:351-353） | 準備中(money 境界) | 否 | select 追加で開通・2026-09-09 裁定206＝据え置き（C層③で入金方法別照合と同時・UI は cash 固定のまま） |」
- 裁定206（Agoora 確定 2026-09-09）: 「D45 回収方法の選択は据え置き＝対応表『準備中(money 境界)』。出典＝B2 着手前調査の裁定要点 4。receivable_collect の p_method は UI で "cash" 固定のまま（RPC は cash/card/other 受理・現金照合式 0055:351-353 は cash のみ＝DB 不変）。入金方法別の照合（カード・その他を日報のどこへ載せるか）と同時に C層③で扱う。B2 では触らない。」
- 裁定 C③-12（2026-09-10）: 「| **C③-12** | D45（入金方法別照合）は本書対象外＝別 mig |」。C③ 設計書 v1 §6 未決「D45(別 mig)」。
- 別 mig に切った理由（C③ 着手前調査 `docs/tmp/c3_survey_20260910.md` §6 の 12 点目・逐語）: 「| 12 | D45 の扱い | A C③ に同梱（daily_reports に ar_collected_card／other・aggregate 改修・UI select）／B C③ から外し別 mig | B（C③ は解除型に集中・D45 は回収方法の日報凍結＝money 境界の別件。UI の select だけ先行するなら『カード回収は現金在高に入らない』注記と同時） |」
- 同調査 §4（逐語）: 「daily_reports の列＝cash／card_gross／card_tax／uri／other／ar_collected（**cash 回収のみ**・列名に方法なし）。aggregate は payments を method 別に合算済み（cash／card／ar／other）＝**入金方法別の売上照合は既存列で足りる**。足りないのは **売掛回収の方法別**（ar_collected が cash 限定・card／other 回収は日報のどこにも載らない）」

## 3. live dump（逐語・要点）

### 入金方法を持つ表と列

| 表.列 | 型 | NOT NULL | default | 区分値（CHECK） |
|---|---|---|---|---|
| payments.method | text | NOT NULL | なし | `payments_method_check`: cash／card／ar／other |
| payments.method_detail | text | null 可 | なし | `payments_method_detail_check`: null か 50 字以内（mig0046・カード／その他の自由記述） |
| ar_collections.method | text | NOT NULL | 'cash' | `ar_collections_method_check`: cash／card／other |
| daily_reports.cash／card_gross／card_tax／uri／other | integer | NOT NULL | 0 | 各 >= 0 |
| daily_reports.ar_collected | integer | NOT NULL | 0 | >= 0（mig0055・**cash 回収のみ**） |
| daily_reports.cash_payout／cash_float | integer | NOT NULL | 0 | >= 0 |
| daily_reports.counted_cash／diff | integer | null 可 | なし | counted_cash null か >= 0 |
| receivables.status | text | NOT NULL | 'open' | open／collected／deducted／voided（method 列なし） |
| checks | — | — | — | method 列なし（入金は payments 側） |

unique／index: daily_reports は `(store_id, biz_date)` unique＋`(store_id, biz_date)` index。payments は `(check_id, pay_group)` index・idem_key partial unique（**method の index なし**）。ar_collections は `(store_id, biz_date)` index・idem_key unique（method の index なし）。

### 締め集計が入金方法別を持つか

- `daily_report_aggregate(p_store_id, p_biz_date, p_cutoff_hm, p_tax_rate)`＝payments を method 別に合算し jsonb で返す: `cash`（method='cash'）／`card`（'card'）／`uri`（'ar'）／`other`（'other'）＋`card_tax`＝round(card × 税率)＋`ar_collected`（ar_collections の **method='cash' のみ**）。
- `daily_report_close` の insert 列＝org_id, store_id, biz_date, **cash, card_gross, card_tax, uri, other**, drink_sales, dohan_checks, slips, guests, open_checks_count, **ar_collected**, expense, cash_payout, cash_float, counted_cash, diff, note, biz_cutoff_hm, card_tax_rate…＝**売上の入金方法別（cash／card／uri／other）は凍結済み**。**売掛回収の方法別は cash だけが凍結**（card／other の回収額は日報のどの列にも入らない）。

### 入金方法別を返す／受ける RPC

| RPC | 入金方法 | 返り |
|---|---|---|
| daily_report_aggregate | 集計（上記） | jsonb（cash／card／uri／other／card_tax／ar_collected…） |
| check_pay(p_check_id, p_method, p_amount, p_pay_group, p_tendered, p_idem_key, p_method_detail) | 受理 4 値 | uuid |
| receivable_collect(p_receivable_id, p_biz_date, p_method default 'cash', p_note, p_idem_key, p_amount) | 受理 3 値（'bad method' で拒否） | uuid |
| payment_record_add(…, p_method, …) | 給与の支払方法（別領域） | uuid |
| customer_list_summary | open_receivable のみ（方法別なし） | table |

入金方法別を **返す** 集計 RPC は daily_report_aggregate だけ（jsonb・当日速報用）。方法別の月次集計 RPC は無い（月次は daily_reports 直 SELECT の凍結列を足す）。

dev の分布: payments cash 43／card 14／ar 4（other 0）。ar_collections 0 行。

## 4. 現行画面の入金方法別表示と出どころ

| 画面 | 表示 | 出どころ |
|---|---|---|
| /register（会計） | 入金方法 select（cash／card／ar／other・`:470` payMethod）・card／other の method_detail・入金一覧 `[群] 方法（detail） ¥`（`:3040`） | payments 直 SELECT（`:553`）＝**生**。check_pay で書く |
| /kiosk-register | 同上（`:464`・`:1161`） | payments 直 SELECT＝生 |
| /report 日報タブ（締め前） | 現金／カード／売掛／その他の集計・決済一致（Σ payments ＝ Σ checks.total・`:1081`）・回収現金（当日 ar_collections・`:225`） | **再集計**（payments を client で method 別合算 `:183-187`）＝daily_report_aggregate と同式 |
| /report 日報タブ（締め済み） | 日別行「現金 ¥／カード ¥」（`:1211`）・売上内訳ドーナツ（決済構成・`:863-916`） | daily_reports の凍結列（cash／card_gross／uri／other／ar_collected） |
| /report 売掛タブ | 回収履歴の方法（`:697` METHOD_LABEL）・前回回収（`:637`） | ar_collections 直 SELECT（生）。回収 UI は `p_method: "cash"` 固定（`:469`） |
| /report 月報 | 売上＝cash＋card_gross＋uri＋other（方法別の表示なし） | daily_reports 凍結 |
| /analytics | 決済構成ドーナツ・決済別実績（payMix＝cash／card_gross／uri／other・`:480`）・card_tax・ar_collected（売掛回収 `:157`） | daily_reports 凍結（月内 Σ）＋ar_collections（当月回収 Σ・生） |
| /dashboard | 今月売上のみ（方法別なし） | daily_reports 凍結 |

## 5. B5-1／B6-1 との整合＝凍結値の照合で作れるか

- **売上側の入金方法別照合**（cash／card／uri／other が伝票の入金と一致するか）は、daily_reports の凍結列と締め前の再集計（同式）が既にあり、**列追加なしで作れる**（B6-1「凍結値の再形」の範囲）。照合式＝凍結 4 列 Σ ＝ Σ payments（closed 伝票・cutoff 窓）＝report-board の決済一致と同型を月次へ広げるだけ。
- **売掛回収の方法別**は凍結列が `ar_collected`（cash 限定）しか無い。card／other の回収は receivables.collected_amount と ar_collections（生）にしか痕跡がなく、**日報の凍結値からは照合できない**。凍結値で照合する設計にするなら **daily_reports への列追加が要る**（＝mig・B6-1 の外・C③-12 の「別 mig」がこれ）。
- 候補列（C③ 調査 §6-12 の A 案を踏襲）: `ar_collected_card integer not null default 0 check (>= 0)`／`ar_collected_other integer not null default 0 check (>= 0)`（既存 ar_collected は cash のまま＝列名・理論在高の式を変えない）。daily_report_aggregate に method='card'／'other' の 2 源を足し、daily_report_close／reclose の insert 列へ 2 列追加。理論在高（現金）には加算しない（0055 の設計＝「非現金回収はドロワー非加算」を維持）。
- 列を足さない案（B）: 月次の売掛回収方法別は ar_collections 直 SELECT（生・RLS owner／manager）で出し、「凍結値ではない」と注記する。B6-1 の「凍結表の新設なし・既存 RPC 不変」には収まるが、B5-1／裁定206 の「回収方法の日報凍結」には応えない。
- どちらでも **UI の select（D45 本体＝receivable_collect の p_method を cash 固定から 3 値へ）** は RPC 不変で開通できる。ただし card／other で回収すると理論在高に入らないため、A 案（列追加）なしで先行すると日報の売掛回収が「現金だけ」に見える＝裁定206 の「注記と同時」条件。

## 6. 裁定が要る点

1. **D45 の範囲**: (i) UI の回収方法 select だけ先行（RPC 不変・注記つき）／(ii) 日報凍結の方法別 2 列＋aggregate／close／reclose 改修＋UI select（別 mig）／(iii) 月次の方法別を ar_collections 直読で出す（凍結なし）。C③-12 と裁定206 の文脈は (ii) 前提。
2. **凍結列の形**: `ar_collected_card`／`ar_collected_other` の 2 列（cash は既存列のまま）か、`ar_collected_by_method jsonb` 1 列か。CHECK・default 0・NOT NULL は既存 ar_collected と同型が自然。
3. **理論在高の式**: card／other 回収は現在どおり現金在高に加算しない（0055 の設計維持）。daily_reports.diff の意味を変えないことの明記。
4. **照合の定義**: 「入金方法別照合」＝(a) 売上 4 列 ＝ Σ payments（伝票側との一致・締め時に既に検査＝#6 決済一致）、(b) 売掛回収 3 列 ＝ Σ ar_collections（method 別）、(c) receivables.collected_amount との突合（回収の総和）。どこまでを日報の画面で出すか。
5. **表示先**: 日報タブの回収現金の隣に「カード回収／その他回収」を並べるか、売掛タブの月次だけか。裁定206 の「カード・その他を日報のどこへ載せるか」が未決のまま。
6. **既存 verify の影響**: daily_report_aggregate／close／reclose の改修は verify:nox-receipt・rls・reopen（締め・再締めの fixture）と golden 外だが f0 の段に触る＝mig の検証観点（列数・CHECK 総数・0055 型の live 写経）を先に決める。
7. **UI 側の注記文言**（裁定206 の条件）: 「カード・その他での回収は現金在高に入りません」を回収モーダルへ。
8. **kiosk-register**: 会計の入金方法は既に 4 値＝D45 の対象外（売掛回収は kiosk に無い）。対象外と明記するか。
