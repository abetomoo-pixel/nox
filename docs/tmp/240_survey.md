# 裁定240 ボタン中央配置 着手前調査（2026-09-11 15:20〜 JST・読取のみ・HEAD 2296319・ahead 8）

対象＝裁定240（逐語）「ボタンは行の中央に配置する（節・表・フォーム直下のボタン、ダイアログの確定/キャンセル）。例外＝表の行内の操作列・ヘッダ右上のログアウト/印刷・リンクと切替・kiosk の下部固定ボタン。実装は共通ラッパ .nox-actions／theme.actionsRow」。
棚卸しの本体＝`docs/tmp/240_inventory.md`（走査器 inv240.cjs・未追跡）。何も変更していない。

## 2. 全画面の数（表 1 の要約）

走査＝app／components の .tsx 114 ファイル。単位＝<button> を束ねる親コンテナ（div／section／form／td…）＝「ボタン行」。

| 区分 | 行数 | 内訳 |
|---|---|---|
| ボタン行 合計 | **372** | 30 画面＋共通部品 4 |
| 対象（節・表・フォーム直下） | **141** | 現在の配置＝左寄せ 127／右寄せ 63（ダイアログ含む）／横幅いっぱい 11／左右分割 2／既に中央 2 |
| 対象（ダイアログの確定／キャンセル・別計上） | **64** | うち sticky 脚（.nox-formmodal-foot）＝categories／products の 2 行 |
| 例外（不触） | **102** | 切替 45／表の行内操作列 41／ログアウト 6（ヘッダ 2・kiosk 4）／印刷 3／固定バー 3／キーパッド 2／kiosk 下部固定 1／リンク動作 1 |
| 保留（相談役判断） | **65** | 一覧の選択タイル（map 内）／入力と同行のインライン／文中のインライン |

画面別（対象の多い順）: /shift 19＋ダイアログ 15／/master 21＋3／/register 16＋14／/casts 14＋7／/kiosk-register 9＋1／/payroll 8＋1／/customers 7＋2／/notices 7＋1／/master/pricing 6＋4（全表は inventory 表 1）。

走査器の限界（目視で読み替えが要る箇所）:
- 「‹／›／今日」の月送り（shift-board 1086・1705／staff-shift-board 109 ほか 6 行）は onClick が setMonth 系で「切替」検出に掛からず**対象**に入っている＝実態は切替（例外）。
- register-board 2052 行「← フロア／−／＋／延長／伝票取消／合算」（6 個）は会計面の操作バー＝「節直下」ではなく操作列に近い＝例外候補。
- billing 141 行「portal／interval／switch」（3 個）は開発用ボタン群。
- 保留 65 のうち「選択タイル」（kiosk の cast／ユーザー選択・pricing の帯選択など）は 240 の「ボタン行」ではない見込み。

## 3. 現行の配置指定と .nox-actions の置き場

現行＝**共通ラッパは無い**。配置はすべて親 div の inline style で個別指定:
- 右寄せ＝`justifyContent: "flex-end"`（app 全体で 30 箇所）または `marginLeft: "auto"`（89 箇所・ボタン以外も含む）または `textAlign: "right"`。対象 205 行のうち右寄せ 68。
- 中央＝`justifyContent: "center"`（9 箇所・ボタン行は 2）／`textAlign: "center"`（39 箇所・ほぼ文言）。
- 左寄せ＝指定なし（flex の既定・block）＝対象の 127 行。
- theme.ts に配置用プロパティは**無い**（row／bdRow／slipRow は明細行・space-between の表示用。actionsRow 該当なし）。globals.css に .nox-actions は**無い**（grep 0）。
- 既存の脚クラス 2 つ: `.nox-formmodal-foot`（517 行・sticky 下端・flex・gap 9・flex-wrap・**justify 指定なし＝左寄せ**）／`.nox-fcard .foot`（1447 行・**space-between**・カード脚に status 文言＋ボタン）。

置き場（242 の .nox-btn.ghost／btnGhost と同じ 2 箇所）:
- globals.css＝`.nox-btn.ghost:disabled`（1322 行）の直後に `.nox-actions { display:flex; justify-content:center; align-items:center; gap:10px; flex-wrap:wrap; margin-top:12px }`（トークン不使用・色なし）。ダイアログ脚は `.nox-formmodal-foot` に `justify-content:center` を足すか、脚の中身を `.nox-actions` で包むかの二択（前者は 1 行・後者は各モーダルの JSX 変更）。
- theme.ts＝`btnGhostLg`（162 行）の直後に `export const actionsRow: CSSProperties = { display:"flex", justifyContent:"center", alignItems:"center", gap:10, flexWrap:"wrap", marginTop:12 }`（inline style 派生用・値は CSS と同一）。
- 付け替え＝対象行の親 div の `justifyContent: "flex-end"`／`marginLeft: "auto"` を外して `className="nox-actions"` か `style={t.actionsRow}` へ。

## 4. 中央化で崩れる恐れ（inventory「崩れ候補」26 行）

| 型 | 件数 | 具体例 | 何が起きるか |
|---|---|---|---|
| 横幅いっぱい（width 100%／flex 1／btnPrimaryLg・btnGhostLg） | 11 | pricing 1773・1933、products 636・767・966、categories 209、register 1891、kiosk 186／619 | 中央寄せは無効（幅 100% のまま）。flex 1 の 2 個並びを center にすると幅指定が勝って見た目不変＝「中央化」の対象外か「幅を auto に戻す」かの裁定が要る |
| 左右分割（space-between に文言＋ボタン） | 2 | notices 232（LINE連携を管理）、simulator-panel 176（元に戻す） | 文言とボタンが両端に分かれている行。center にすると文言と並ぶ＝ラッパ適用外にするか、ボタンだけ次行へ |
| 3 個以上並び | 13 | shift-add-form 367（5 個）・522（3 個）、shift-board 1268・1476（3〜4 個）、notices 387（3 個）、register 1531（3 個）、reservation-panel 446（4 個） | モバイル幅で折返し＝flex-wrap で 2 段中央になる。段の途中で主ボタンが左右に散らないよう `gap` と並び順（主ボタン末尾）を揃える必要 |
| sticky 脚（.nox-formmodal-foot） | 2 | categories 209、products 636 | 脚は sticky・幅 100% ボタン＝現状不変で可。脚に center を足すなら幅 100% ボタンとの組合せで無効 |
| space-between 脚（.nox-fcard .foot） | 0 対象（status 文言＋ボタンの脚は保留側） | — | ラッパ適用外に置くのが安全 |
| モバイル幅 | 全対象 | — | `.nox-kpis` 同様の @media は不要（flex-wrap＋center で折返しごとに中央）。ただし kiosk（例外）と幅 100% 型は触らない |

## 5. ui-tokens と verify

- `.nox-actions`／`actionsRow` は**色を持たない**（display／justify／gap／margin のみ）＝ui-tokens の検出 A（色リテラル）・B（未定義 var）に掛からず **baseline 56 不変・新トークン 0**。
- verify で拾えるもの: 現行の ui-tokens は色のみで配置は見ない。静的に守るなら「ボタン行の親に `justifyContent: "flex-end"`／`marginLeft: "auto"` が残っていない」を inv240 と同じ走査で数える DB 非依存 suite（走数外・裁定229 型）が作れる。ただし例外（表の行内・切替）を白名単で持つ必要があり、白名単の維持コストが本体の変更より大きい＝**推奨は suite なし・棚卸し（inventory）を docs に収蔵して目視で確認**。

## 6. 想定レーン（案・裁定後）

- client 1 本＝定義 2 箇所（.nox-actions／actionsRow）＋対象行の付け替え。205 行（141＋64）を一括は大きい＝画面群で 3 分割（① master 系＋casts＋customers／② register＋shift＋payroll＋report／③ 残り）か、ダイアログ脚を `.nox-formmodal-foot` の 1 行で先に揃える案。
- 保留 65 と走査器の疑義（月送り・会計操作バー・開発用）は裁定で例外に確定してから着手。
