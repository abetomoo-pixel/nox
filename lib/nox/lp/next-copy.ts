// ★相談役 11/26 の便 L3（便 J＝LP の 1 回目）: /lp-next の文と写しの一覧（検査 verify:nox-lp-next が読む）。
//   今の本番にある機能だけ。数字と条件は作らない・変えない（料金の文は今の /lp の文のまま）。導入実績・お客様の声・順位・根拠の無い数字は入れない。
//   写しは公開デモ（架空のデータ・CLUB VESPER）から切り抜いた 1 機能 1 枚（public/lp/next/）。

export const LPN_HERO = {
  h1: ["伝票の1杯から、", "給与明細まで、", "ひとつの流れで。"] as const,
  lead: "レジの伝票、指名とバック、シフトと打刻、源泉と明細。ナイトワーク店舗の仕事を、同じデータでつなぎます。",
  cta: "公開デモで画面を見る",
} as const;

export type LpnShot = { src: string; alt: string; caption: string; w: number; h: number; phone?: boolean };
export type LpnPillar = { id: string; h2: string; lead: string; points: readonly string[]; shots: readonly LpnShot[] };

export const LPN_PILLARS: readonly LpnPillar[] = [
  {
    id: "payroll",
    h2: "伝票から、明細まで一気通貫。",
    lead: "レジで付けた指名とドリンクが、そのままバックになり、源泉を引いて給与明細になります。手で集計し直す工程がありません。",
    points: ["レジの伝票に本指名・場内・同伴を紐づけ", "バック・売上歩合・ボーナスを明細の行に", "源泉所得税を引いた手取りまで", "確定した期間は一覧で支払状況を管理"],
    shots: [
      { src: "/lp/next/register.jpg", alt: "レジの卓の一覧（公開デモ）", caption: "レジ：卓ごとの人数・滞在・延長までの時間と金額", w: 590, h: 186 },
      { src: "/lp/next/payslip.jpg", alt: "キャストの確定給与明細（公開デモ）", caption: "給与明細：バック・売上歩合から源泉を引いた手取りまで", w: 740, h: 1480, phone: true },
      { src: "/lp/next/payroll.jpg", alt: "給与の月次一覧（公開デモ）", caption: "給与：期間ごとの確定と支払状況", w: 792, h: 734, phone: true },
    ],
  },
  {
    id: "formats",
    h2: "業態ごとの形に、合わせられる。",
    lead: "キャバクラ・ラウンジ・ホストクラブ。料金の決め方も、報酬の決め方も、店のルールのまま設定します。",
    points: ["ホストクラブ：初回料金（税・サ込みのきっかりの額・時間で終わり）", "時間で終わりの卓は、店長以上が延長に切り替え", "時間帯ごとの時給", "日給の保証と、歩合の段"],
    shots: [
      { src: "/lp/next/first-visit.jpg", alt: "料金マスタの初回料金（公開デモ）", caption: "初回料金：額の持ち方と時間の終わり方を選ぶ", w: 796, h: 946, phone: true },
      { src: "/lp/next/hourly.jpg", alt: "待遇プランの時間帯の時給（公開デモ）", caption: "時間帯の時給：18:00〜21:00 と 21:00〜26:00 で別の額", w: 720, h: 778, phone: true },
    ],
  },
  {
    id: "shift",
    h2: "シフトと打刻を、スマホで。",
    lead: "キャストは LINE からシフトの希望を出し、自分のスマホで出勤・休憩・退勤を打刻。店はその日の出勤状況をひと目で見られます。",
    points: ["LINE のメニューからシフトの希望へ", "出勤・休憩・退勤の打刻（休憩は店ごとに使う／使わない）", "勤務時間の丸め（丸めない・5・10・15・30 分）"],
    shots: [
      { src: "/lp/next/punch.jpg", alt: "キャストのマイページの打刻（公開デモ）", caption: "打刻：今日の出勤の予定と出勤のボタン", w: 740, h: 420, phone: true },
      { src: "/lp/next/shift.jpg", alt: "シフト管理の今日（公開デモ）", caption: "シフト：今日の出勤予定・確定・審査中・不足", w: 860, h: 640, phone: true },
      { src: "/lp/next/round.jpg", alt: "店舗設定の勤務時間の丸め（公開デモ）", caption: "勤務時間の丸め：丸めない・5・10・15・30 分", w: 796, h: 926, phone: true },
      { src: "/lp/next/break.jpg", alt: "店舗設定の休憩の打刻（公開デモ）", caption: "休憩の打刻：店ごとに使う／使わない", w: 796, h: 332, phone: true },
    ],
  },
  {
    id: "onboarding",
    h2: "導入は、運営が一緒に。",
    lead: "初期設定は運営が代行できます。席・料金・メニュー・待遇の下書きから、LINE 連携まで。店は中身を確かめてから使い始められます。",
    points: ["初期設定の下書きを運営が作成", "LINE 連携の設定まで代行", "スタッフ・キャストは招待で参加"],
    shots: [],
  },
];

/** 料金（今の /lp の文のまま） */
export const LPN_PRICE_MONTHLY = 29800;
export const LPN_PRICE_FAQ = "月額29,800円／店舗（税込）です。年払いの割引もあります。詳細はお問い合わせください。";
