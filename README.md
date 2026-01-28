# B3 Portfolio Tracker & Simulator

A TypeScript-based automation tool to transform messy B3 (Brazilian Stock Exchange) transaction history into a professional, split-adjusted Google Sheets dashboard.

Unlike static trackers, this tool handles the "hard parts" of the Brazilian market: **Stock Splits**, **Ticker Migrations**, **M&As**, and **Delistings (OPAs)** through a chronological ledger engine.

## 🚀 Features

- **Smart Ledger Engine:** Automatically calculates adjusted quantities by injecting synthetic "Split" and "Merger" rows into your transaction history.
- **Yahoo Finance Integration:** Fetches real-time prices and historical corporate actions (splits).
- **Automatic Enrichment:** Categorizes assets by Sector, Industry, and Name.
- **Interactive Simulator:** Includes a custom Google Sheets "What-If" calculator to simulate new purchases and see projected sector allocations.
- **Wipe & Rebuild Strategy:** Ensures data integrity by rebuilding the portfolio from raw inputs every run, preventing duplicate transaction errors.

## 🛠 Project Structure

The system processes three types of inputs to ensure 100% accuracy:

1.  **Broker Exports:** Drop your monthly Excel/CSV exports into `/data_inputs`.
2.  **Ticker Mappings:** (`config_renames.json`) To handle migrations like `EMBR3` → `EMBJ3`.
3.  **Manual Overrides:** (`forced_exits.csv`) To "zero out" delisted companies like `ENBR3` or `BIDI11` that vanish from broker reports.

## 📋 Prerequisites

- **Node.js** (v18 or higher)
- **Google Cloud Project:** You need a Service Account to write to Google Sheets.
- **Google Sheet ID:** Create a blank sheet and grab the ID from the URL.

## ⚙️ Setup & Installation

1.  **Clone the repo:**

    ```bash
    git clone https://github.com/your-username/b3-portfolio-tracker.git
    cd b3-portfolio-tracker
    npm install
    ```

2.  **Google Cloud Credentials:**
    - Go to [Google Cloud Console](https://console.cloud.google.com/).
    - Create a Service Account and download the **JSON Key**.
    - Open your Google Sheet and **Share** it with the `client_email` found in that JSON.

3.  **Environment Variables:**
    Create a `.env` file in the root directory and fill in your details:
    ```env
    SHEET_ID=your_google_sheet_id_here
    GOOGLE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
    GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYourKeyHere\n-----END PRIVATE KEY-----\n"
    ```

## 📂 Data Inputs

Place your files in the `/data_inputs` folder:

- **Transactions:** Any `.csv` or `.xlsx` with columns: `Data`, `Tipo de Movimentação` (Compra/Venda), `Ativo`, `Quantidade`, `Valor`.
- **config_mergers.json:** Define stock swaps (e.g., PARD3 to FLRY3).
- **forced_exits.csv:** List delisted stocks and their final exit price.

## 🏃 Usage

Run the sync script:

```bash
npm run start
```

The script will:

1. Parse all files in `/data_inputs`.
2. Fetch splits from Yahoo Finance.
3. Generate `Portfolio_Stocks`, `Portfolio_FIIs`, and the `Simulator` tabs.

## 📊 The Simulator Tab

The `Simulator` tab is designed to be **persistent**.

- **Do not delete this tab.** The script is programmed to "Update in Place," refreshing prices and current quantities while preserving your manually created charts.
- Use the **Yellow Column** to input "Planned Purchases" and see your sector allocation update in real-time via Google Sheets formulas.

## 🤝 Contributing

Contributions are welcome! If you find a bug in the B3 split logic or want to add support for new asset types (like Treasury/Tesouro Direto), feel free to open a PR.

## ⚖️ License

MIT

---

_Disclaimer: This tool is for informational purposes only. Always verify your tax obligations (Imposto de Renda) with official B3/Broker documents._
