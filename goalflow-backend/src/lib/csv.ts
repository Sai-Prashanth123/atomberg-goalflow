import { stringify } from "csv-stringify/sync";
import ExcelJS from "exceljs";

export function toCsv(rows: Record<string, unknown>[], columns: { key: string; header: string }[]): string {
  return stringify(rows, {
    header: true,
    columns: columns.map((c) => ({ key: c.key, header: c.header })),
  });
}

export async function toXlsx(
  rows: Record<string, unknown>[],
  columns: { key: string; header: string; width?: number }[],
  sheetName = "Sheet1",
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18 }));
  ws.addRows(rows);
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2BB44" } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
