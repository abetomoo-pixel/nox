/* Server Direct Print エンベロープ（F4b-2・BANZEN receipt-envelope 同型の薄層）。
 *
 * Epson TM 系の Server Direct Print は、プリンタが poll URL へ定期 POST し、
 * サーバは「印刷ジョブあり」なら PrintRequestInfo XML を、「なし」なら空ボディ 200 を返す。
 * ★実機未検証の差し替え点（P4.6 実機マニュアル一次資料で確認・BANZEN 同型の宿題）:
 *   - devid / timeout の実値・printjobid の桁制約（24hex は BANZEN 実測の制限系）
 *   - 「印刷不要」応答の正確な形（空ボディ 200 を暫定採用）
 *   - result POST の実フィールド名（route 側のパースは寛容に実装済み）
 * ★BOM 無し必須（BANZEN 実測＝BOM 付きはプリンタが XML を読めない）。route 側でも付けない。
 */

export function buildPrintEnvelope(printJobId: string, eposXml: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<PrintRequestInfo Version="3.00">` +
    `<ePOSPrint>` +
    `<Parameter>` +
    `<devid>local_printer</devid>` +
    `<timeout>60000</timeout>` +
    `<printjobid>${printJobId}</printjobid>` +
    `</Parameter>` +
    `<PrintData>` +
    eposXml +
    `</PrintData>` +
    `</ePOSPrint>` +
    `</PrintRequestInfo>`
  );
}

/** 印刷ジョブなし（または無害拒否）の応答ボディ＝空文字（200・text/xml）。 */
export const EMPTY_POLL_RESPONSE = "";
