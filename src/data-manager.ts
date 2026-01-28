import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import {
  Transaction,
  CsvTransaction,
  MergerEvent,
  ForcedExitEvent,
} from "./types";
import { normalizeTicker } from "./b3-service";

const DATA_INPUTS_DIR = "./data_inputs";
const RENAMES_FILE = "./src/config/config_renames.json";
const MERGERS_FILE = "./src/config/config_mergers.json";
const EXITS_FILE = "./src/config/forced_exits.csv";

export class DataManager {
  static getAllFiles(): string[] {
    if (!fs.existsSync(DATA_INPUTS_DIR)) {
      fs.mkdirSync(DATA_INPUTS_DIR);
      console.log(`Created directory: ${DATA_INPUTS_DIR}`);
      return [];
    }

    return fs
      .readdirSync(DATA_INPUTS_DIR)
      .filter((file) => {
        const ext = path.extname(file).toLowerCase();
        return (
          [".csv", ".xlsx", ".xls"].includes(ext) &&
          !file.startsWith("forced_exits")
        );
      })
      .map((file) => path.join(DATA_INPUTS_DIR, file));
  }

  static readRenames(): Record<string, string> {
    if (!fs.existsSync(RENAMES_FILE)) return {};
    try {
      const content = fs.readFileSync(RENAMES_FILE, "utf-8");
      return JSON.parse(content);
    } catch (e) {
      console.warn("Failed to read renames config", e);
      return {};
    }
  }

  static readMergers(): MergerEvent[] {
    if (!fs.existsSync(MERGERS_FILE)) return [];
    try {
      const content = fs.readFileSync(MERGERS_FILE, "utf-8");
      const data = JSON.parse(content);
      return data.map((d: any) => ({
        ...d,
        date: new Date(d.date), // Ensure Date object
      }));
    } catch (e) {
      console.warn("Failed to read mergers config", e);
      return [];
    }
  }

  static readForcedExits(): ForcedExitEvent[] {
    if (!fs.existsSync(EXITS_FILE)) return [];
    try {
      const content = fs.readFileSync(EXITS_FILE, "utf-8");
      const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
      return records.map((r: any) => {
        return {
          date: new Date(r.Date),
          ticker: normalizeTicker(r.Ticker),
          price: parseFloat(r.Price),
        };
      });
    } catch (e) {
      console.warn("Failed to read forced exits config", e);
      return [];
    }
  }

  static readValues(
    filePath: string,
    renames: Record<string, string> = {},
  ): Transaction[] {
    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);

    if (ext === ".csv") {
      return this.readCsv(filePath, fileName, renames);
    } else if (ext === ".xlsx" || ext === ".xls") {
      return this.readExcel(filePath, fileName, renames);
    }
    return [];
  }

  private static readCsv(
    filePath: string,
    fileName: string,
    renames: Record<string, string>,
  ): Transaction[] {
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const records: CsvTransaction[] = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      delimiter: [",", ";"],
      trim: true,
    });

    return records.map((r) => this.mapToTransaction(r, fileName, renames));
  }

  private static readExcel(
    filePath: string,
    fileName: string,
    renames: Record<string, string>,
  ): Transaction[] {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      console.warn(`Empty Excel file: ${fileName}`);
      return [];
    }
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      console.warn(`Could not read sheet ${sheetName} in ${fileName}`);
      return [];
    }

    const records = XLSX.utils.sheet_to_json(sheet) as any[];

    return records.map((r) => {
      const mapped: any = {
        Data: r["Data"],
        "Tipo de Movimentação": r["Tipo de Movimentação"],
        Ativo: r["Ativo"],
        Quantidade: r["Quantidade"],
        Valor: r["Valor"],
        Preço: r["Preço"],
      };
      return this.mapToTransaction(mapped, fileName, renames);
    });
  }

  private static mapToTransaction(
    r: any,
    fileName: string,
    renames: Record<string, string>,
  ): Transaction {
    const parseNumber = (val: any): number => {
      if (typeof val === "number") return val;
      if (typeof val === "string") {
        const trimmed = val.trim();
        if (trimmed.includes(",")) {
          return parseFloat(trimmed.replace(/\./g, "").replace(",", "."));
        }

        const lastDot = trimmed.lastIndexOf(".");
        const lastComma = trimmed.lastIndexOf(",");

        if (lastComma > lastDot) {
          // Comma is the decimal separator (BR)
          return parseFloat(trimmed.replace(/\./g, "").replace(",", "."));
        } else if (lastDot > lastComma) {
          // Dot is the decimal separator (US)
          return parseFloat(trimmed.replace(/,/g, ""));
        }

        return parseFloat(trimmed);
      }
      return 0;
    };

    const quantity = parseNumber(r["Quantidade"]);
    const totalValue = parseNumber(r["Valor"]);
    const unitPrice = parseNumber(r["Preço"]);

    const rawType = (r["Tipo de Movimentação"] || "").trim();
    let type:
      | "BUY"
      | "SELL"
      | "SPLIT"
      | "REVERSE_SPLIT"
      | "MERGER_OUT"
      | "MERGER_IN"
      | "FORCED_SALE";

    if (rawType.match(/Compra/i)) {
      type = "BUY";
    } else if (rawType.match(/Venda/i)) {
      type = "SELL";
    } else {
      type = "BUY"; // Default or Warn
      console.warn(
        `Unknown type '${rawType}' in ${fileName}, defaulting to BUY`,
      );
    }

    let ticker = normalizeTicker(r["Ativo"] || "");
    const baseTicker = ticker.replace(".SA", "");
    if (renames[baseTicker]) {
      ticker = normalizeTicker(renames[baseTicker]);
    }

    return {
      date: this.parseDate(r["Data"]),
      type: type,
      ticker: ticker,
      quantity: quantity,
      unitPrice: unitPrice,
      totalValue: totalValue,
      sourceFile: fileName,
    };
  }

  private static parseDate(dateVal: any): Date {
    if (dateVal instanceof Date) return dateVal;
    if (typeof dateVal === "number") {
      return new Date(Math.round((dateVal - 25569) * 864e5));
    }
    if (typeof dateVal === "string") {
      // pt-BR DD/MM/YYYY
      const parts = dateVal.split("/");
      if (parts.length === 3) {
        const day = parseInt(parts[0]!, 10);
        const month = parseInt(parts[1]!, 10) - 1;
        const year = parseInt(parts[2]!, 10);
        return new Date(year, month, day);
      }
    }
    return new Date(); // Fallback
  }
}
