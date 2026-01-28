import { JWT } from "google-auth-library";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { fetchSplits } from "./b3-service";
import { DataManager } from "./data-manager";
import { LedgerProcessor } from "./ledger-processor";
import { MetadataService } from "./metadata-service";
import { ChartManager } from "./chart-manager";
import { SimulatorManager } from "./simulator-manager";
import dotenv from "dotenv";

dotenv.config();

const SHEET_ID = process.env.SHEET_ID!;
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL!;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY!;

async function main() {
  console.log("🚀 Starting Portfolio Generator (Wipe & Rebuild)...");

  console.log("⚙️  Reading configurations...");
  const renames = DataManager.readRenames();
  const mergers = DataManager.readMergers();
  const exits = DataManager.readForcedExits();
  console.log(`   - Renames: ${Object.keys(renames).length}`);
  console.log(`   - Mergers: ${mergers.length}`);
  console.log(`   - Forced Exits: ${exits.length}`);

  console.log("📂 Reading input files from ./data_inputs...");
  const files = DataManager.getAllFiles();
  if (files.length === 0) {
    console.warn("⚠️ No files found in ./data_inputs. Exiting.");
    return;
  }

  let allTransactions = [];
  for (const file of files) {
    console.log(`Processing: ${file}`);
    const txs = DataManager.readValues(file, renames);
    allTransactions.push(...txs);
  }
  console.log(`📋 Loaded ${allTransactions.length} transactions.`);

  const uniqueTickers = [
    ...new Set(allTransactions.map((t) => t.ticker)),
  ].filter(Boolean);

  const splits = await fetchSplits(uniqueTickers, "2020-01-01");
  console.log(`✂️ Found ${splits.length} split events.`);

  const ledger = LedgerProcessor.process(
    allTransactions,
    splits,
    mergers,
    exits,
  );
  console.log(
    `📊 Generated Ledger with ${ledger.length} items (Including virtual adjustments).`,
  );

  const serviceAccountAuth = new JWT({
    email: GOOGLE_CLIENT_EMAIL,
    key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);
  await doc.loadInfo();
  console.log(`Connected to sheet: ${doc.title}`);

  let ledgerSheet = doc.sheetsByTitle["Unified_Ledger"];
  if (!ledgerSheet)
    ledgerSheet = await doc.addSheet({ title: "Unified_Ledger" });

  await ledgerSheet.clear();
  await ledgerSheet.setHeaderRow([
    "Date",
    "Action",
    "Ticker",
    "Quantity",
    "Unit Price",
    "Total Value",
    "Source",
    "Original File",
  ]);

  const rows = ledger.map((item) => ({
    Date: toPtBrDate(item.date),
    Action: item.type,
    Ticker: item.ticker.replace(".SA", ""),
    Quantity: item.quantity,
    "Unit Price": item.unitPrice,
    "Total Value": item.totalValue,
    Source: item.isVirtual ? "SYSTEM" : "FILE",
    "Original File": item.sourceFile || "N/A",
  }));

  await ledgerSheet.addRows(rows);

  console.log(`✅ Success! Unified_Ledger updated.`);

  console.log(
    "🌍 Enriching data with Metadata (Sector, Industry, Asset Class)...",
  );
  const profiles = await MetadataService.getProfiles(uniqueTickers);

  console.log("📈 Generating Portfolio Compilation...");

  const portfolioMap = new Map<string, number>();
  for (const item of ledger) {
    const current = portfolioMap.get(item.ticker) || 0;
    let change = 0;
    if (item.type === "BUY") change = item.quantity;
    else if (item.type === "SELL") change = -item.quantity;
    else if (item.type === "SPLIT") change = item.quantity;
    else if (item.type === "REVERSE_SPLIT") change = -item.quantity;
    else if (item.type === "MERGER_IN") change = item.quantity;
    else if (item.type === "MERGER_OUT") change = -item.quantity;
    else if (item.type === "FORCED_SALE") change = -item.quantity;
    portfolioMap.set(item.ticker, current + change);
  }

  const activeHoldings = Array.from(portfolioMap.entries())
    .filter(([_, qty]) => qty > 0)
    .map(([ticker, qty]) => {
      const profile = profiles.get(ticker);
      return {
        ticker,
        qty,
        profile,
      };
    });

  const stocks = activeHoldings.filter((h) => h.profile?.assetClass !== "FII");
  const fiis = activeHoldings.filter((h) => h.profile?.assetClass === "FII");

  console.log(`   - Stocks: ${stocks.length}`);
  console.log(`   - FIIs: ${fiis.length}`);

  const createPortfolioTab = async (
    title: string,
    holdings: typeof activeHoldings,
    withCharts: boolean = false,
  ) => {
    const existingSheet = doc.sheetsByTitle[title];
    if (existingSheet) {
      await existingSheet.delete();
      console.log(`🗑️  Deleted existing tab: ${title}`);
    }

    const sheet = await doc.addSheet({ title });
    console.log(`✨ Created new tab: ${title}`);

    await sheet.clear();
    await sheet.setHeaderRow([
      "Ticker",
      "Name",
      "Sector",
      "Industry",
      "Quantity",
      "Current Price",
      "Total Value",
    ]);

    const rows = holdings
      .sort((a, b) => a.ticker.localeCompare(b.ticker))
      .map((h, index) => {
        const rowIndex = index + 2;
        return {
          Ticker: h.ticker.replace(".SA", ""),
          Name: h.profile?.name || "",
          Sector: h.profile?.sector || "",
          Industry: h.profile?.industry || "",
          Quantity: h.qty,
          "Current Price": `=GOOGLEFINANCE(CONCATENATE("BVMF:";A${rowIndex}); "price")`,
          "Total Value": `=IF(ISNA(F${rowIndex});0;E${rowIndex}*F${rowIndex})`,
        };
      });

    await sheet.addRows(rows);

    if (rows.length > 0) {
      await sheet.loadCells(`F2:G${rows.length + 1}`);
      const brlFormat = { type: "CURRENCY", pattern: "R$ #,##0.00" };

      for (let i = 0; i < rows.length; i++) {
        const r = i + 1; // 0-based index for Row 2+
        sheet.getCell(r, 5).numberFormat = brlFormat as any; // F (Price)
        sheet.getCell(r, 6).numberFormat = brlFormat as any; // G (Total Value)
      }
      await sheet.saveUpdatedCells();
    }

    console.log(`✅ Populated ${title} with ${rows.length} rows.`);

    if (withCharts && rows.length > 0) {
      console.log(`📊 Generating Charts for ${title}...`);
      const chartHoldings = holdings.map((h) => ({
        ticker: h.ticker,
        name: h.profile?.name || "",
        sector: h.profile?.sector || "Unknown",
        industry: h.profile?.industry || "Unknown",
        qty: h.qty,
      }));

      await sheet.loadCells(`A1:P${Math.max(50, rows.length + 5)}`);

      const counts = await ChartManager.createSummaryTables(
        sheet,
        chartHoldings,
      );
      await ChartManager.addCharts(sheet, counts);
      console.log(`🎨 Charts added to ${title}.`);
    }
  };

  await createPortfolioTab("Portfolio_Stocks", stocks, true);
  await createPortfolioTab("Portfolio_FIIs", fiis, false);

  const simulatorData = activeHoldings.map((h) => ({
    ticker: h.ticker,
    qty: h.qty,
    profile: h.profile,
  })) as any; // Cast to any to bypass strict optional check conflict

  await SimulatorManager.createOrUpdate(doc, simulatorData);
}

function toPtBrDate(date: Date): string {
  const d = new Date(date);
  const day = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

main().catch(console.error);
