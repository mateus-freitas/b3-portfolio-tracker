import {
  GoogleSpreadsheet,
  GoogleSpreadsheetWorksheet,
} from "google-spreadsheet";
import { AssetProfile } from "./types";

interface SimulatorHolding {
  ticker: string;
  qty: number;
  profile?: AssetProfile;
}

export class SimulatorManager {
  static async createOrUpdate(
    doc: GoogleSpreadsheet,
    holdings: SimulatorHolding[],
  ) {
    console.log("🎲 processing Simulator tab...");
    let sheet = doc.sheetsByTitle["Simulator"];

    // Sort holdings by Ticker
    const data = holdings.sort((a, b) => a.ticker.localeCompare(b.ticker));

    if (!sheet) {
      await this.createSheet(doc, data);
    } else {
      await this.updateSheet(sheet, data);
    }
  }

  private static async createSheet(
    doc: GoogleSpreadsheet,
    data: SimulatorHolding[],
  ) {
    console.log("   ✨ Creating new Simulator sheet...");
    const sheet = await doc.addSheet({ title: "Simulator" });

    // Headers (Cols A-H)
    await sheet.setHeaderRow([
      "Ticker",
      "Sector",
      "Price",
      "Current Qty",
      "ADD QTY",
      "Proj Qty",
      "Proj Value",
      "Current Value",
    ]);

    // Write Data Rows
    await this.writeRows(sheet, data, true);

    // Add Summaries & Charts
    await this.setupSummariesAndCharts(sheet, data.length);
    console.log("   ✅ Simulator created.");
  }

  private static async updateSheet(
    sheet: GoogleSpreadsheetWorksheet,
    data: SimulatorHolding[],
  ) {
    console.log("   🔄 Updating existing Simulator (Smart Update)...");

    // 1. Headers Update (Ensure Col H exists)
    try {
      await sheet.setHeaderRow([
        "Ticker",
        "Sector",
        "Price",
        "Current Qty",
        "ADD QTY",
        "Proj Qty",
        "Proj Value",
        "Current Value",
      ]);
    } catch (e) {}

    // 2. Data Update
    await this.writeRows(sheet, data, false);

    // 3. Migration / Chart Check
    await sheet.loadCells("J1:K1");
    const cellJ1 = sheet.getCellByA1("J1");

    if (cellJ1.value === "Projected Sector Allocation" || !cellJ1.value) {
      console.log("   🚀 Upgrading Simulator to v2 (Adding Charts)...");
      await this.setupSummariesAndCharts(sheet, data.length);
    } else {
      console.log("   Charts already exist. Skipping.");
    }

    console.log("   ✅ Simulator updated (User inputs preserved).");
  }

  private static async writeRows(
    sheet: GoogleSpreadsheetWorksheet,
    data: SimulatorHolding[],
    isNew: boolean,
  ) {
    const rowCount = Math.max(sheet.rowCount, data.length + 5);
    await sheet.loadCells(`A1:H${rowCount}`);

    const brlFormat = { type: "CURRENCY", pattern: "R$ #,##0.00" } as any;

    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      if (!item) continue;
      const row = i + 2;
      const rowIndex = i + 1;

      sheet.getCell(rowIndex, 0).value = item.ticker.replace(".SA", "");
      sheet.getCell(rowIndex, 1).value = item.profile?.sector || "Unknown";
      const cellC = sheet.getCell(rowIndex, 2);
      cellC.formula = `=GOOGLEFINANCE(CONCATENATE("BVMF:";A${row}); "price")`;
      cellC.numberFormat = brlFormat;
      sheet.getCell(rowIndex, 3).value = item.qty;
      sheet.getCell(rowIndex, 5).formula = `=D${row}+E${row}`;

      const cellG = sheet.getCell(rowIndex, 6);
      cellG.formula = `=F${row}*C${row}`;
      cellG.numberFormat = brlFormat;

      const cellH = sheet.getCell(rowIndex, 7);
      cellH.formula = `=D${row}*C${row}`;
      cellH.numberFormat = brlFormat;
    }

    let currentRow = data.length + 1;
    while (currentRow < sheet.rowCount) {
      const cellA = sheet.getCell(currentRow, 0);
      if (!cellA.value && !cellA.formula) break;

      for (let col = 0; col <= 7; col++) {
        try {
          sheet.getCell(currentRow, col).value = null;
          sheet.getCell(currentRow, col).formula = null;
        } catch (e) {}
      }
      currentRow++;
    }

    await sheet.saveUpdatedCells();
  }

  private static async setupSummariesAndCharts(
    sheet: GoogleSpreadsheetWorksheet,
    dataLength: number,
  ) {
    await sheet.loadCells("J1:N5");
    const brlFormat = { type: "CURRENCY", pattern: "R$ #,##0.00" } as any;

    const cJ1 = sheet.getCellByA1("J1");
    cJ1.value = "Current Sector Allocation";
    cJ1.textFormat = { bold: true };
    const cK1 = sheet.getCellByA1("K1");
    cK1.value = "Total Value";
    cK1.textFormat = { bold: true };

    const cJ2 = sheet.getCellByA1("J2");
    cJ2.formula = `=QUERY(A:H; "Select B, Sum(H) Where B is not null Group by B Label Sum(H) ''")`;

    const cM1 = sheet.getCellByA1("M1");
    cM1.value = "Projected Sector Allocation";
    cM1.textFormat = { bold: true };
    const cN1 = sheet.getCellByA1("N1");
    cN1.value = "Total Value";
    cN1.textFormat = { bold: true };

    const cM2 = sheet.getCellByA1("M2");
    cM2.formula = `=QUERY(A:H; "Select B, Sum(G) Where B is not null Group by B Label Sum(G) ''")`;

    await sheet.saveUpdatedCells();

    // Format Spill Areas (Blindly format K2:K50 and N2:N50)
    // K is col 10 (0-based)
    // N is col 13 (0-based)
    await sheet.loadCells("K2:N50");
    for (let r = 1; r < 50; r++) {
      try {
        const rowIdx = r;
        const cK = sheet.getCell(rowIdx, 10);
        cK.numberFormat = brlFormat;

        const cN = sheet.getCell(rowIdx, 13);
        cN.numberFormat = brlFormat;
      } catch (e) {}
    }
    await sheet.saveUpdatedCells();

    await this.addSimulatorCharts(sheet);
  }

  private static async addSimulatorCharts(sheet: GoogleSpreadsheetWorksheet) {
    const sheetId = sheet.sheetId;
    const ROW_LIMIT = 15; // Assume Query won't exceed 15 sectors

    const requests = [
      // Chart 1: Current (J,K) -> Position J15
      {
        addChart: {
          chart: {
            spec: {
              title: "Current Sector Allocation",
              pieChart: {
                threeDimensional: true,
                legendPosition: "RIGHT_LEGEND",
                domain: {
                  sourceRange: {
                    sources: [
                      {
                        sheetId,
                        startRowIndex: 1,
                        endRowIndex: ROW_LIMIT,
                        startColumnIndex: 9,
                        endColumnIndex: 10,
                      },
                    ],
                  },
                }, // J
                series: {
                  sourceRange: {
                    sources: [
                      {
                        sheetId,
                        startRowIndex: 1,
                        endRowIndex: ROW_LIMIT,
                        startColumnIndex: 10,
                        endColumnIndex: 11,
                      },
                    ],
                  },
                }, // K
              },
            },
            position: {
              overlayPosition: {
                anchorCell: { sheetId, rowIndex: 15, columnIndex: 9 }, // J15
                widthPixels: 400,
                heightPixels: 300,
              },
            },
          },
        },
      },
      // Chart 2: Projected (N,O) -> Position N15
      {
        addChart: {
          chart: {
            spec: {
              title: "Projected Sector Allocation",
              pieChart: {
                threeDimensional: true,
                legendPosition: "RIGHT_LEGEND",
                domain: {
                  sourceRange: {
                    sources: [
                      {
                        sheetId,
                        startRowIndex: 1,
                        endRowIndex: ROW_LIMIT,
                        startColumnIndex: 12,
                        endColumnIndex: 13,
                      },
                    ],
                  },
                }, // M
                series: {
                  sourceRange: {
                    sources: [
                      {
                        sheetId,
                        startRowIndex: 1,
                        endRowIndex: ROW_LIMIT,
                        startColumnIndex: 13,
                        endColumnIndex: 14,
                      },
                    ],
                  },
                }, // N
              },
            },
            position: {
              overlayPosition: {
                anchorCell: { sheetId, rowIndex: 15, columnIndex: 13 }, // N15 (Col 13 is N)
                widthPixels: 400,
                heightPixels: 300,
              },
            },
          },
        },
      },
    ];

    // @ts-ignore
    await sheet._spreadsheet._makeBatchUpdateRequest(requests);
  }
}
