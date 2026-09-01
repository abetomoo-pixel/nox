# pages-2026-08（全画面モック13枚・2026-08-07 受領）

- **見た目の正本はここ**。機能の正本は repo の実装＋各設計書（docs/）＝挙動・RPC・権限はモックから読まない。
- **モックに無い要素は削除指示ではない**（既存機能の欠落＝モック側の省略として扱い、実装の削除根拠にしない）。
- 相談役提示の照合リスト（mock_pages-2026-08_sha256.txt・先頭16桁＋bytes）を 2026-08-08 に受領し、下記実測表と**全13枚一致を確認済み＝来歴クローズ**。
- 照合リスト原本は本ディレクトリに同梱（mock_pages-2026-08_sha256.txt・sha256 518c9e43…7486・2026-08-08 同梱＝受領記載のみで未同梱だった残債の解消）。
- **14枚目 `nox-cast-compensation-canonical.html`（2026-08-31 差替受領＝canonical v2・sha256 `2483805fab5f37dfadabae60a273ec1f2e522d389759d3047fe4936102024f53`・42,360 bytes）＝「M2待遇」canonical**（待遇オールインワン・money-core 級）。旧 `nox-cast-compensation-all-in-one.html`（2026-08-20 受領・sha256 `899e51000b21f705…6999f455`・39,474 bytes）は **v2 差替で削除**（来歴は git 履歴に残る）。**DP のトークン多数決は 13枚のまま**（DP0-1 裁定＝母数外）で、**DP の変換対象外**（DP1-④＝M2待遇レーン所属）。（下表は 2026-08-08 受領時の 13枚のまま＝来歴クローズ済みの記録として保存）。
- **15枚目 `nox-cast-compensation-canonical-v3.html`（2026-09-01 受領＝canonical **v3**・裁定106・sha256 `a88accc730b7fcd8975ceb989ced9db87b638e89fe412345eb90b7e0c63ec62e`・39,657 bytes）＝「M2待遇」canonical の正本を v3 へ差替**。
  6タブ構成（basic/backs/slides/quota/sim/assign）・機能トグル型（使うノルマ/達成条件だけ有効化）・準備中カード列挙は撤去（pt 系の注記1文のみ）。
  受領来歴＝Downloads の推敲5版（v3-tabs→v6-readable・title は全て「正本 v3」）のうち**最終 v6-readable（mtime 15:59・正本スクショ 16:00 と整合）を byte 同一収蔵**。
  v2 ファイル `nox-cast-compensation-canonical.html` は**前版として残置**（U-2 実装（裁定101/104）の底本来歴・比較用）。DP 母数外は v2 と同じ。

| ファイル | sha256（実測） |
|---|---|
| nox-analytics-dashboard.html | 7456e5db19a82c49413c13a5741df43366db51dc601d2076d22253eab7c51065 |
| nox-announcement-management.html | c9d67b543b07388b6607b2a32c3a9a4f0c047e6a426b7618ebe89f08d36bdd2d |
| nox-audit-management.html | e3a92792121b5d7b39d91ee4d98a11a0aa3bf8ab12d5b9315d41d2609956ff2c |
| nox-business-hours-settings.html | 13504c7f7e421f956cae3f4e37681708c56600d6c9f6cfbcdf0bd64318ed5b6d |
| nox-cast-management.html | 99a4fc32b53d6098a1055bd96fb06e38508fb76934bba8ba9e96b06872905e82 |
| nox-customer-management.html | 9a4847c57010d9112b9fb751887b2639916ae49932200c94f6ccd7ebca734d94 |
| nox-daily-report.html | a7513a48148e6fbbcb3ad9f80f87c531d7e5bc1b7d66e6edf3a765c81b5b462d |
| nox-payroll-management.html | d9ed45abfe5ea53d62ec0755c01a5840ede6e2ba8717015dd4d34a7c344255ef |
| nox-pricing-settings.html | ec71ac2182253f44536904d05a672a46415ebbd55bf8fde093868ab59f5e58ac |
| nox-register-pos.html | d21bdac477e986d9a69f1b21bb521207dee43b7e0c2afdd1afb3c70eaea2bbe2 |
| nox-seat-table-settings.html | 5dbbb4cf75335022be5ca48ae05272ca3aba3228a01989badae5adc13b2856a8 |
| nox-shift-management.html | 1503c968ed25582fdb74cd430ec0676aa2cb7818c8083955c52f68ae6620de3b |
| nox-staff-system-settings.html | 9bf1f9d70a07cb7808cd0e6f3a94073b0407ee6cf56f46b1d743c815fb2f35c1 |
