import { zipSync } from "fflate";

const excludedColumns = new Set(["raw", "upload_token"]);
const maxRows = 1_048_576;
const maxColumns = 16_384;

function xmlEscape(value: string) {
  const validXmlText = Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return (
        codePoint === 0x09 ||
        codePoint === 0x0a ||
        codePoint === 0x0d ||
        (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
        (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
        (codePoint >= 0x10000 && codePoint <= 0x10ffff)
      );
    })
    .join("");
  return validXmlText
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function columnName(index: number) {
  let name = "";
  let value = index + 1;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function cellXml(reference: string, value: unknown) {
  if (value === null || value === undefined) return `<c r="${reference}"/>`;
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${reference}" t="n"><v>${value}</v></c>`;
  }
  if (typeof value === "boolean") {
    return `<c r="${reference}" t="b"><v>${value ? 1 : 0}</v></c>`;
  }
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
}

export function createExcelWorkbook(rows: readonly object[]) {
  if (!rows.length) throw new Error("There are no records to export.");

  const records = rows.map((row) =>
    Object.fromEntries(
      Object.entries(row)
        .filter(([key]) => !excludedColumns.has(key))
        .map(([key, value]) => [
          key,
          typeof value === "object" && value !== null ? JSON.stringify(value) : value,
        ]),
    ),
  );
  const columns = [...new Set(records.flatMap((record) => Object.keys(record)))];
  if (records.length + 1 > maxRows || columns.length > maxColumns) {
    throw new Error("This export exceeds Excel worksheet row or column limits.");
  }
  if (!columns.length) throw new Error("There are no columns to export.");

  const worksheetRows = [
    columns,
    ...records.map((record) => columns.map((column) => record[column])),
  ]
    .map(
      (row, rowIndex) =>
        `<row r="${rowIndex + 1}">${row
          .map((value, columnIndex) => cellXml(`${columnName(columnIndex)}${rowIndex + 1}`, value))
          .join("")}</row>`,
    )
    .join("");
  const lastCell = `${columnName(columns.length - 1)}${records.length + 1}`;
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": new TextEncoder().encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        "</Types>",
    ),
    "_rels/.rels": new TextEncoder().encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        "</Relationships>",
    ),
    "xl/workbook.xml": new TextEncoder().encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets><sheet name="Results" sheetId="1" r:id="rId1"/></sheets>' +
        "</workbook>",
    ),
    "xl/_rels/workbook.xml.rels": new TextEncoder().encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        "</Relationships>",
    ),
    "xl/worksheets/sheet1.xml": new TextEncoder().encode(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
        `<sheetData>${worksheetRows}</sheetData><autoFilter ref="A1:${lastCell}"/></worksheet>`,
    ),
  };
  return zipSync(files);
}
