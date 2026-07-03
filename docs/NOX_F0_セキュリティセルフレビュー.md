# NOX F0 セキュリティセルフレビュー報告書（相談役レビュー用）

> 作成: 2026-07-02（F0e 完了時点・commit `2200c1a`）。レビュー通過をもって F0 フェーズグループを push する。
> 対象: F0a 雛形／F0b mig0001／F0c payOf／F0d mig0002＋修正 mig0003・0004／F0e verify スイート（全137 assertion 緑）。

---

## 1. 成果物と検証状態

| サブ | 成果物 | 検証 |
|---|---|---|
| F0a | Next.js 15 + Supabase SSR + TS strict 雛形・docs 6本のファイル名修正 | build/typecheck 緑・Vercel Ready 相当 |
| F0b | mig0001（認可ヘルパー4本・コア5テーブル・RLS） | 手動検証4項目＋G4/G5 で自動化 |
| F0c | lib/nox/pay.ts（payOf 純関数）・money.ts（丸め集約） | verify:nox-pay 76 緑（玲奈2系統） |
| F0d | mig0002（audit_logs・完全内部専用 wrapper）＋mig0003/0004（grant 修正） | 手動検証＋G1〜G3/G6 で自動化 |
| F0e | seed:f0＋verify 4本（pay/anon-guard/rls/grants） | 137 assertion 全緑 |

## 2. BANZEN 教訓チェックリスト対照

| 観点 | 状態 | 根拠 |
|---|---|---|
| RPC 冒頭 null guard | ✅ | 唯一の SECURITY DEFINER RPC＝audit_log_write に `auth_org_id() is null → raise`。ヘルパー4本は読み取り専用で null 返却＝ポリシー側 fail-closed |
| revoke は public+anon 両方 | ✅ | ヘルパー4本（＋grant authenticated）。verify G3/anon-guard で実測 |
| 内部専用は4ロール revoke | ✅ | audit_log_write＝public/anon/authenticated/service_role（mig0004）。G3 で ACL 保持者=owner のみを恒久 assert |
| テーブル grant 面（TRUNCATE は RLS 非適用） | ✅ | mig0003 で6テーブル authenticated=SELECT のみ。G1「スキーマ全体で SELECT 以外ゼロ」で今後のテーブル追加も自動回帰 |
| RLS 相互参照の無限再帰回避 | ✅ | users→memberships は一方向（memberships ポリシーは users を引かない）。CLAUDE.md に規約化 |
| 書き込みポリシーを作らない | ✅ | 全テーブル SELECT のみ。書込は RPC/service 経由（verify:nox-rls で insert/update/delete 遮断を実測） |
| append-only（audit_logs） | ✅ | UPDATE/DELETE ポリシー無し＋revoke 明示＋G6（ポリシー=select 1本） |
| cast プライバシー土台 | ✅ | casts にパターン1適用済み（castA1a→自分の1行のみ実測）。パターン2は audit_logs（owner 限定が包含）で最初の実例。パターン3・集計 RPC は F1f 以降 |
| UUID=gen_random_uuid / 単一トランザクション / prosrc 検証 | ✅ | 全 mig。prosrc 検証は G4（DEFINER＋search_path 固定）で自動化 |
| 認可の真実= memberships・1ユーザー1アクティブ | ✅ | 部分ユニークインデックス。F4 は index drop＋ヘルパー差替のみ |
| secret キーのクライアント混入防御 | ✅ | admin.ts の window ガード（BANZEN 踏襲）・.env.local は git 追跡外（check-ignore 確認済み） |

## 3. ★指摘事項：auth_org_id() と membership 喪失（退職）

### 3.1 事象
`auth_org_id()` は `users.is_active` のみを見る。membership を `is_active=false` にした退職者（users は active のまま）でも：
- **orgs の自社1行が SELECT できる**（`orgs_select: id = auth_org_id()`）→ org の name / plan / status が見える。
- **users の自分行が SELECT できる**（self 枝 `auth_user_id = auth.uid()`）→ 自分のデータのみ。

他は fail-closed：stores / memberships / casts / audit_logs は `auth_role()` / `auth_store_id()` が null になるため 0 行（verify:nox-rls の枠組みで確認可能な構造）。

### 3.2 実害評価
**低**。漏れるのは「org 名・契約プラン・status」と本人自身の users 行のみで、店舗・キャスト・金額・監査には到達しない。ただし「退職者は is_active=false で即時失効」（データモデル設計 §2.1）の原則に対し、**plan/status は内部契約情報**であり原則違反が残る。放置せず F1 で締めるべき。

### 3.3 対策提案：方式A（ヘルパー側）を推奨・F1 最初の mig（0005 予定）に同梱
```sql
create or replace function public.auth_org_id()
returns uuid language sql stable security definer set search_path = public as $$
  select u.org_id
  from public.users u
  join public.memberships m on m.user_id = u.id and m.is_active
  where u.auth_user_id = auth.uid() and u.is_active
$$;
```
- **効果**：退職（アクティブ membership ゼロ）→ auth_org_id() が null → orgs 0行。users の self 枝も `org_id = auth_org_id()` の AND 条件で死ぬため**自分行も 0 行**＝完全失効。
- **方式Aの利点**：1関数の差し替えのみ・全ポリシー不変・「memberships が認可の真実」に auth_org_id も揃う（現状は users が真実になっていた＝原則との不整合が根因）。
- **方式B（ポリシー側・不採用）**：orgs_select 等へ `auth_role() is not null` を追加する案。テーブルごとに足す必要があり漏れリスク・以後の全テーブルに条項が増える。
- **検証**：mig0005 適用時に verify:nox-rls へ退職ケース（membership を is_active=false → orgs/users 0行 → 復帰で再可視）を追加。
- **F4 との整合**：F4 のヘルパー差し替え（現在店選択）でも membership join は維持される形であり衝突しない。

## 4. 既知の設計判断（承認済み・リスク受容の記録）

| 判断 | 内容 | 承認 |
|---|---|---|
| memberships の self 参照なし | staff/cast は自分の membership 行を直接 SELECT できない（無限再帰回避）。ロールはヘルパー経由 | F0b |
| audit_logs は owner 限定 | 認可設計 §1.2（audit=owner のみ）を §2.3 パターン2 より優先 | F0d |
| store_id/actor は FK なし log 値 | 監査の残存性優先（K-f 踏襲） | F0d |
| action は enum で縛らない | F1 以降の RPC 名が入る | F0d |
| ip はベストエフォート | PostgREST 経由のみ取得（service 直 INSERT 時は null） | F0d |

## 5. 先送り事項の引き継ぎ台帳（全件）

### F1 で対応（F1 完了時の状態・2026-07-03 更新）
| # | 項目 | 出典 | 内容 |
|---|---|---|---|
| 1 | ~~auth_org_id() の membership join 化（§3）~~ **クローズ** | 本報告書 | mig0005 で方式A適用・verify 退職回帰（capture-and-restore）で恒久 assert |
| 2 | ~~middleware PROTECTED リスト拡張~~ **クローズ** | lib/supabase/middleware.ts | F1f-1 で5パス（mine/register/shift/report/master）に拡張・確認①で実測 |
| 3 | ~~cast プライバシー パターン1/2/3 の本適用＋集計 RPC~~ **クローズ** | 認可設計 §2.3/§3 | パターン1=check_cast_backs/勤怠4テーブル・パターン2=会計/日報系・パターン3=products で新設時適用済み。集計 RPC=get_cast_ranking（mig0011・金額列なし）。notices のパターン3は F3 |
| 4 | 日次データの実データ化 | scripts/verify-nox-pay.ts | **器は完了**（punches=実打刻・checks=実売上）。**payOf 入力への結線（突合純関数＝#20・daily.sales 定義＝#21）は F2 冒頭**へ |
| 5 | 新 RPC 追加ごとの anon-guard 追記運用 | verify:nox-anon-guard.ts | **運用定着**（段1〜7・公開22 RPC＋内部4関数をカバー・以後も新 RPC ごとに追記） |

### F2 で対応（コンプラゲート：税理士・社労士）
| # | 項目 | 出典 | 内容 |
|---|---|---|---|
| 6 | service_role 監査経路 | mig0002 ヘッダー | 給与確定（service）の監査書込＝「RLS バイパス直 INSERT か p_org_id 明示 service 専用 RPC か」を F2c で決定 |
| 7 | 源泉の日数定義 | pay.ts L9・精密仕様 §7 | 出勤日数（現実装）か暦日数か → **税理士** |
| 8 | 二重控除ガード | pay.ts L10 | 送り実費 vs 一律送り代（現状モック忠実の両取り）。okuriDeduct/deductions 分離入力済み＝payOf 内1箇所で追加可 |
| 9 | 売上バック率テーブルの店設定化 | pay.ts L12/L110 | 現状モック値（3/5/7/10%）をデフォルト引数。店マスタ化するか F2 判断 |
| 10 | 丸め round vs floor | money.ts L3 | **税理士** floor 指定なら roundYen 1箇所差替 |
| 11 | 雇用（給与）の源泉・社保 | pay.ts withholdingOf（雇用=0） | **社労士**確認のうえ実装 |
| 12 | シミュ係数の雇用 1.0 | pay.ts simAddedPay | 理論値で実装済み（モックは委託前提）。雇用モード導入時に確認 |
| 13 | 玲奈ゴールデン二系統の扱い | 精密仕様 §6 追記・verify T1a/T1b | 正は T1b（pt込み5931）。T1a（5170）は設計書値の回帰として維持。F2 で本番プラン確定時に実データゴールデン追加を検討 |
| 14 | cast_sensitive 分離 | mig0001 ヘッダー・認可設計 §2.4 | real_name/birthday/mynumber を別テーブル＋暗号化＋閲覧専用RPC＋アクセスログ（F2b） |
| 14b | receivables の cast_id 索引 | F1b レビュー（2026-07-02） | F2 の給与天引き集計（deduct_from_cast）で cast_id 検索が必要になった時点で `create index on receivables (cast_id, status)` を F2 の mig に含める |
| 20 | 打刻突合純関数 | F1d 決定1（2026-07-02） | モック lx/vp を lib/nox に翻訳（F2a）。**in-in・孤立 out の解決仕様はこの純関数が正本**（punches は盲目記録）。シフト×打刻×attendance から days/lateN/absentN を確定 |
| 21 | daily.sales（cast 日次売上）の定義 | F1d plan §5 | payOf の日次売上按分の集計元（checks×check_nominations からの規則）を F2 冒頭で確定 |
| 22 | fix_requests（打刻修正の申請→承認） | BANZEN 0005 | F1d は manager 代理打刻＋note で運用。申請承認フローは F3 の承認系と合わせて検討 |
| 23 | ジオフェンス設定・打刻ハードモード | BANZEN 0028 | within_geofence は器のみ（常に null）。enforce/店座標/WiFi 台帳は要件顕在化時に 0028 を翻訳 |
| 24 | ~~staff（黒服）への勤怠書込開放~~ **クローズ（2026-07-02・mig0011）** | F1d 決定（§2.5 追記8） | **確定: attendance_set のみ staff に開放・punch_proxy は manager 維持**（mig0011 適用済み・verify で staffA1 の成功/拒否を実測） |
| 28 | ドリンク申告（drink_claims）の F3 送り | F1f plan（2026-07-02） | 段階リリース計画の F1f 記載「ドリンク申告の基本」は、drink_claims テーブルが F3（mig0006 群・承認フローと不可分）のため **F3f へ移動**（cast セルフ pending 作成＋黒服承認をセットで実装） |
| 29 | /mine バック表示の created_at 近似 | F1f-2（2026-07-02） | cast は checks を読めない（パターン2）ため月帰属は check_cast_backs.created_at≒close 時刻の営業日変換で近似。**F2 給与明細 UI 設計時に、境界日ズレへの注記表示（集計期間の明示）を検討**。給与の厳密集計は F2 サーバ集計が正 |
| 30 | bottle_keeps の閲覧・操作 UI | F1f-4（2026-07-03） | テーブル・RLS（パターン2）は mig0005 で整備済みだが F1f では画面未実装。**F2 以降で customers（F3）と合わせて導線を設計**（ボトルは顧客に紐づく運用のため単独画面より顧客詳細への統合が自然） |
| 25 | カードTAX の請求時上乗せ | F1e plan §3 | モックは日報集計のみ（請求に乗せない）。実店舗ヒアリング後に check_pay の card 上乗せへ変更するか判断 |
| 26 | charge 行の細分類（charge_kind） | F1e mig0010 ヘッダー | 同伴料・セット・延長・指名料の金額分離集計に必要（現状 dohan_checks 件数のみ）。F1f UI か F2 日報拡張時に追加判断 |
| 27 | reclose で実査（counted_cash）を null に戻す経路 | F1e レビュー（2026-07-02） | 現行 reclose は null=既存維持のため実査の取り消しができない。F1f の UI 設計時に再訪（記録のみ・対応不要） |

### F4 で対応
| # | 項目 | 出典 | 内容 |
|---|---|---|---|
| 15 | マルチ店舗切替 | mig0001 L13/L88 | memberships_one_active_per_user_idx を drop＋ヘルパー4本を「現在店選択」に差替（スキーマ変更なし） |
| 16 | **memberships.role check に 'kiosk' が無い** | mig0001 role check | キオスクロール導入時に check 制約の alter が必要（認可設計 §7.5）。F4 着手時の mig に含める |
| 17 | stores の billing 列 | データモデル設計 §2.1 | BANZEN billing gate 踏襲の列追加＋auth_billing_writable 型ヘルパー |

### 設計書の整合（任意・相談役判断）
| # | 項目 | 内容 |
|---|---|---|
| 18 | 認可設計 §1.2 と §2.3 の不整合 | §2.3 パターン2の対象に audit_logs が載るが、§1.2 は audit=owner のみ。実装は owner 限定採用済み。§2.3 側への注記追記を提案 |

### 運用メモ（恒常）
- seed:f0 は dev 専用・本番で実行しない（CLAUDE.md 規約化済み）。
- 新環境構築時：mig 0001→0004 番号順手貼り・node_modules/.next の Dropbox ignore 再設定・.env.local は BOM なし UTF-8。

## 6. 結論

F0 完了条件（認可ヘルパーが効く・他店0行・anon BLOCKED・payOf 全項目緑・build 緑）は充足。
**残指摘は §3（退職者の orgs 1行可視・実害低・F1 mig0005 で方式A対応）のみ**で、F0 の push をブロックする水準ではないと自己評価する。
相談役レビュー通過の連絡をもって main を push する。
