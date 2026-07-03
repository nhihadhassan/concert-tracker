import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const [inputPath, outputPath, renderDir] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  throw new Error("Usage: workbook_builder.mjs SNAPSHOT_JSON OUTPUT_XLSX [RENDER_DIR]");
}

const payload = JSON.parse(await fs.readFile(inputPath, "utf8"));
const workbook = Workbook.create();
const palette = {
  title: "#111827",
  header: "#5B5EE8",
  headerText: "#FFFFFF",
  text: "#172033",
  muted: "#64748B",
  border: "#D9E0EB",
  panel: "#F3F5FA",
};

const titleFor = (name) => `${name} Snapshot`;
const displayHeader = (value) => value
  .split("_")
  .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
  .join(" ");

const columnWidth = (header) => {
  if (["notes", "image", "spotify_url", "override_reason", "value"].includes(header)) return 44;
  if (["artist", "venue", "tour", "display_name", "reviewer_name"].includes(header)) return 24;
  if (["id", "concert_id", "user_id", "reviewer_user_id"].includes(header)) return 38;
  if (header === "scope") return 38;
  if (header === "key") return 28;
  if (header === "metric") return 30;
  if (header === "value_json") return 24;
  if (["date", "concert_date", "fetched_at"].includes(header)) return 14;
  return Math.max(12, Math.min(22, displayHeader(header).length + 3));
};

const tableNames = new Set();
for (const definition of payload.sheets) {
  const sheet = workbook.worksheets.add(definition.name);
  sheet.showGridLines = false;
  const width = Math.max(2, definition.headers.length);
  const lastColumn = String.fromCharCode(64 + Math.min(width, 26));
  sheet.getRange(`A1:${lastColumn}1`).merge();
  sheet.getRange("A1").values = [[titleFor(definition.name)]];
  sheet.getRange("A1").format = {
    fill: palette.title,
    font: { bold: true, color: "#FFFFFF", size: 16 },
    verticalAlignment: "center",
  };
  sheet.getRange("A1").format.rowHeight = 30;
  sheet.getRange(`A2:${lastColumn}2`).merge();
  sheet.getRange("A2").values = [[
    `${definition.rows.length} records | ${payload.metadata.fetched_at} | read-only recovery copy`,
  ]];
  sheet.getRange("A2").format = {
    fill: palette.panel,
    font: { color: palette.muted, italic: true, size: 10 },
    verticalAlignment: "center",
  };
  sheet.getRange("A2").format.rowHeight = 22;

  const headerRange = sheet.getRangeByIndexes(3, 0, 1, definition.headers.length);
  headerRange.values = [definition.headers.map(displayHeader)];
  headerRange.format = {
    fill: palette.header,
    font: { bold: true, color: palette.headerText },
    borders: { preset: "outside", style: "thin", color: palette.header },
    verticalAlignment: "center",
  };
  headerRange.format.rowHeight = 24;

  if (definition.rows.length) {
    const normalizedRows = definition.rows.map((row) => row.map((value, index) => {
      if (value === null || value === undefined) return null;
      if (definition.dateColumns.includes(index) && typeof value === "string") {
        return new Date(`${value}T12:00:00Z`);
      }
      return value;
    }));
    const dataRange = sheet.getRangeByIndexes(4, 0, normalizedRows.length, definition.headers.length);
    dataRange.values = normalizedRows;
    dataRange.format = {
      font: { color: palette.text, size: 10 },
      borders: { insideHorizontal: { style: "thin", color: palette.border } },
      verticalAlignment: "top",
    };
    for (const index of definition.dateColumns) {
      sheet.getRangeByIndexes(4, index, normalizedRows.length, 1).format.numberFormat = "yyyy-mm-dd";
    }
    for (const [index, header] of definition.headers.entries()) {
      const range = sheet.getRangeByIndexes(4, index, normalizedRows.length, 1);
      if (["price", "total_spent"].includes(header)) range.format.numberFormat = '"$"#,##0.00';
      if (header.endsWith("rating") || header.endsWith("score")) range.format.numberFormat = "0.0";
      range.format.wrapText = ["notes", "override_reason", "value"].includes(header);
    }
    if (definition.name === "Sync Metadata") {
      sheet.getRangeByIndexes(4, 1, normalizedRows.length, 1).format.numberFormat = "@";
    }
    let tableName = `${definition.name.replaceAll(" ", "")}Table`;
    while (tableNames.has(tableName)) tableName += "Data";
    tableNames.add(tableName);
    const table = sheet.tables.add(
      sheet.getRangeByIndexes(3, 0, normalizedRows.length + 1, definition.headers.length),
      true,
      tableName,
    );
    table.style = "TableStyleMedium4";
    table.showBandedColumns = false;
    table.showFilterButton = true;
  } else {
    sheet.getRange(`A5:${lastColumn}5`).merge();
    sheet.getRange("A5").values = [["No records in this snapshot"]];
    sheet.getRange("A5").format = {
      fill: "#FAFBFD",
      font: { color: palette.muted, italic: true },
      horizontalAlignment: "center",
    };
    sheet.getRange("A5").format.rowHeight = 28;
  }

  for (const [index, header] of definition.headers.entries()) {
    sheet.getRangeByIndexes(0, index, Math.max(5, definition.rows.length + 4), 1).format.columnWidth = columnWidth(header);
  }
  sheet.freezePanes.freezeRows(4);
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

if (renderDir) {
  await fs.mkdir(renderDir, { recursive: true });
  const savedWorkbook = await SpreadsheetFile.importXlsx(await FileBlob.load(outputPath));
  const verification = {};
  for (const definition of payload.sheets) {
    const preview = await savedWorkbook.render({
      sheetName: definition.name,
      autoCrop: "all",
      scale: 1,
      format: "png",
    });
    const filename = `${definition.name.toLowerCase().replaceAll(" ", "-")}.png`;
    await fs.writeFile(path.join(renderDir, filename), new Uint8Array(await preview.arrayBuffer()));
    const maxRows = Math.min(definition.rows.length + 4, 14);
    const maxCols = Math.min(definition.headers.length, 26);
    verification[definition.name] = JSON.parse((await savedWorkbook.inspect({
      kind: "table",
      range: `${definition.name}!A1:${String.fromCharCode(64 + maxCols)}${Math.max(5, maxRows)}`,
      include: "values,formulas",
      tableMaxRows: 14,
      tableMaxCols: 26,
      maxChars: 5000,
    })).ndjson.split("\n").filter(Boolean)[0] || "{}");
  }
  const errors = await savedWorkbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 100 },
    summary: "formula error scan",
  });
  verification.formulaErrors = errors.ndjson;
  await fs.writeFile(
    path.join(renderDir, "verification.json"),
    JSON.stringify(verification, null, 2),
  );
}
