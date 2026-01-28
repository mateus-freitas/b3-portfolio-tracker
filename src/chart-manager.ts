import { GoogleSpreadsheetWorksheet } from "google-spreadsheet";

export interface HoldingData {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  qty: number;
}

export class ChartManager {
  static async createSummaryTables(
    sheet: GoogleSpreadsheetWorksheet,
    holdings: HoldingData[],
  ) {
    // 1. Prepare Keys
    const sectors = [
      ...new Set(holdings.map((h) => h.sector || "Unknown")),
    ].sort();
    const industries = [
      ...new Set(holdings.map((h) => h.industry || "Unknown")),
    ].sort();

    const dataStartRow = 2;
    const dataEndRow = dataStartRow + holdings.length - 1;

    const rangeSector = `C${dataStartRow}:C${dataEndRow}`;
    const rangeValue = `G${dataStartRow}:G${dataEndRow}`;
    const rangeIndustry = `D${dataStartRow}:D${dataEndRow}`;
    const rangeTicker = `A${dataStartRow}:A${dataEndRow}`;

    // BRL Format Pattern
    const brlFormat = { type: "CURRENCY", pattern: "R$ #,##0.00" };

    // --- Table A: Sector (I, J) ---
    // Header
    const cellI1 = sheet.getCellByA1("I1");
    cellI1.value = "Sector";
    cellI1.textFormat = { bold: true };
    const cellJ1 = sheet.getCellByA1("J1");
    cellJ1.value = "Total Value";
    cellJ1.textFormat = { bold: true };

    // Rows
    for (let i = 0; i < sectors.length; i++) {
      const row = i + 2; // 1-based
      const sector = sectors[i];

      const cSec = sheet.getCellByA1(`I${row}`);
      cSec.value = sector;

      const cVal = sheet.getCellByA1(`J${row}`);
      // =SUMIF(C:C, I2, G:G)
      cVal.formula = `=SUMIF(${rangeSector}; "${sector}"; ${rangeValue})`;
      cVal.numberFormat = brlFormat as any;
    }

    const cellL1 = sheet.getCellByA1("L1");
    cellL1.value = "Top 10 Tickers";
    cellL1.textFormat = { bold: true };
    const cellM1 = sheet.getCellByA1("M1");
    cellM1.value = "Total Value";
    cellM1.textFormat = { bold: true };

    const cellL2 = sheet.getCellByA1("L2");
    // Range A:G includes Ticker(A) and Value(G).
    const queryRange = `A${dataStartRow}:G${dataEndRow}`;
    cellL2.formula = `=QUERY(${queryRange}; "SELECT A, G ORDER BY G DESC LIMIT 10")`;

    for (let r = 2; r <= 11; r++) {
      const cVal = sheet.getCellByA1(`M${r}`);
      cVal.numberFormat = brlFormat as any;
    }

    // --- Table C: Industry (O, P) ---
    const cellO1 = sheet.getCellByA1("O1");
    cellO1.value = "Industry";
    cellO1.textFormat = { bold: true };
    const cellP1 = sheet.getCellByA1("P1");
    cellP1.value = "Total Value";
    cellP1.textFormat = { bold: true };

    for (let i = 0; i < industries.length; i++) {
      const row = i + 2;
      const ind = industries[i];

      const cInd = sheet.getCellByA1(`O${row}`);
      cInd.value = ind;

      const cVal = sheet.getCellByA1(`P${row}`);
      cVal.formula = `=SUMIF(${rangeIndustry}; "${ind}"; ${rangeValue})`;
      cVal.numberFormat = brlFormat as any;
    }

    await sheet.saveUpdatedCells();

    return {
      sectorCount: sectors.length,
      industryCount: industries.length,
    };
  }

  static async addCharts(
    sheet: GoogleSpreadsheetWorksheet,
    counts: { sectorCount: number; industryCount: number },
  ) {
    const sheetId = sheet.sheetId;

    const sectorRange = {
      sheetId,
      startRowIndex: 1, // Row 2
      endRowIndex: 1 + counts.sectorCount,
      startColumnIndex: 8, // Col I
      endColumnIndex: 10, // Col K (Exclusive, so J is included)
    };

    const top10Range = {
      sheetId,
      startRowIndex: 1,
      endRowIndex: 11, // Top 10
      startColumnIndex: 11, // L
      endColumnIndex: 13, // N (exclusive M)
    };

    const industryRange = {
      sheetId,
      startRowIndex: 1,
      endRowIndex: 1 + counts.industryCount,
      startColumnIndex: 14, // O
      endColumnIndex: 16, // Q (exclusive P)
    };

    const requests = [
      // 1. Sector Donut
      {
        addChart: {
          chart: {
            spec: {
              title: "Sector Allocation",
              pieChart: {
                threeDimensional: true,
                legendPosition: "RIGHT_LEGEND",
                domain: {
                  sourceRange: {
                    sources: [
                      {
                        sheetId,
                        startRowIndex: 1,
                        endRowIndex: 1 + counts.sectorCount,
                        startColumnIndex: 8,
                        endColumnIndex: 9,
                      },
                    ],
                  },
                },
                series: {
                  sourceRange: {
                    sources: [
                      {
                        sheetId,
                        startRowIndex: 1,
                        endRowIndex: 1 + counts.sectorCount,
                        startColumnIndex: 9,
                        endColumnIndex: 10,
                      },
                    ],
                  },
                },
              },
            },
            position: {
              overlayPosition: {
                anchorCell: { sheetId, rowIndex: 15, columnIndex: 8 }, // I15
                widthPixels: 400,
                heightPixels: 300,
              },
            },
          },
        },
      },
      // 2. Top 10 Bar
      {
        addChart: {
          chart: {
            spec: {
              title: "Top 10 Holdings",
              basicChart: {
                chartType: "BAR",
                legendPosition: "NO_LEGEND",
                axis: [
                  { position: "BOTTOM_AXIS", title: "Value (R$)" },
                  { position: "LEFT_AXIS", title: "Ticker" },
                ],
                domains: [
                  {
                    domain: {
                      sourceRange: {
                        sources: [
                          {
                            sheetId,
                            startRowIndex: 1,
                            endRowIndex: 11,
                            startColumnIndex: 11,
                            endColumnIndex: 12,
                          },
                        ],
                      },
                    },
                  },
                ],
                series: [
                  {
                    series: {
                      sourceRange: {
                        sources: [
                          {
                            sheetId,
                            startRowIndex: 1,
                            endRowIndex: 11,
                            startColumnIndex: 12,
                            endColumnIndex: 13,
                          },
                        ],
                      },
                    },
                  },
                ],
              },
            },
            position: {
              overlayPosition: {
                anchorCell: { sheetId, rowIndex: 15, columnIndex: 12 }, // M15
                widthPixels: 400,
                heightPixels: 300,
              },
            },
          },
        },
      },
      // 3. Industry Column
      {
        addChart: {
          chart: {
            spec: {
              title: "Industry Breakdown",
              basicChart: {
                chartType: "COLUMN",
                legendPosition: "NO_LEGEND",
                domains: [
                  {
                    domain: {
                      sourceRange: {
                        sources: [
                          {
                            sheetId,
                            startRowIndex: 1,
                            endRowIndex: 1 + counts.industryCount,
                            startColumnIndex: 14,
                            endColumnIndex: 15,
                          },
                        ],
                      },
                    },
                  },
                ],
                series: [
                  {
                    series: {
                      sourceRange: {
                        sources: [
                          {
                            sheetId,
                            startRowIndex: 1,
                            endRowIndex: 1 + counts.industryCount,
                            startColumnIndex: 15,
                            endColumnIndex: 16,
                          },
                        ],
                      },
                    },
                  },
                ],
              },
            },
            position: {
              overlayPosition: {
                anchorCell: { sheetId, rowIndex: 35, columnIndex: 8 }, // I35 (Below Donut)
                widthPixels: 600,
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
