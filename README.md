# B3 Portfolio Tracker & Simulator

A TypeScript-based automation tool to transform B3 (Brazilian Stock Exchange) transaction history into a professional, split-adjusted Google Sheets dashboard.

Unlike static trackers, this tool handles the complexity of the Brazilian market—**Stock Splits**, **Ticker Migrations**, **M&As**, and **Delistings (OPAs)**—through a chronological ledger engine.

## 🚀 Features

- **Smart Ledger Engine:** Injects synthetic "Split" and "Merger" rows into your history to ensure 100% quantity accuracy.
- **Yahoo Finance Integration:** Automatic metadata enrichment (Sectors, Industries, and Names).
- **Interactive Simulator:** A persistent "What-If" calculator in Google Sheets to test new purchases.
- **Community Configs:** Built-in handling for common B3 events (e.g., BIDI11 migration, ENBR3/SQIA3 delistings, RLOG/PARD mergers).

## 🛠 Project Structure & Inputs

The system merges three data sources:

1.  **`/data_inputs` (User Specific):**
    - Place your broker exports here (CSV/XLSX).
    - Required columns: `Data`, `Tipo de Movimentação` (Compra/Venda), `Ativo`, `Quantidade`, `Valor`.
    - _Note: This folder is ignored by git to keep your financial data private._

2.  **`/src/config` (Shared/Community):**
    - `config_renames.json`: Mappings for ticker changes (e.g., `EMBR3` → `EMBJ3`).
    - `config_mergers.json`: Mathematical ratios for stock swaps (e.g., RLOG to CSAN).
    - `forced_exits.csv`: Final exit dates and prices for delisted companies (OPAs).
    - _Note: These are committed to the repo. If you have data for a new merger or OPA, please open a PR!_

3.  **Yahoo Finance API:**
    - Used for real-time prices and historical splits.

## ⚙️ Setup & Installation

1.  **Clone & Install:**

    ```bash
    git clone https://github.com/mateus-freitas/b3-portfolio-tracker.git
    npm install
    ```

2.  **Google Cloud Setup:**
    - Create a Service Account in the [Google Cloud Console](https://console.cloud.google.com/).
    - Download the JSON Key and share your Google Sheet with the `client_email` found in the key.

3.  **Environment Variables:**
    Create a `.env` file in the root:
    ```env
    SHEET_ID=your_google_sheet_id_here
    GOOGLE_CLIENT_EMAIL=your-service-account-email
    GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYourKey\n-----END PRIVATE KEY-----\n"
    ```

## 🏃 Usage

1.  Drop your monthly transaction files into `/data_inputs`.
2.  Run the sync:
    ```bash
    npm run start
    ```
3.  Check your Google Sheet for the updated `Portfolio_Stocks`, `Portfolio_FIIs`, and the interactive `Simulator`.

## 📊 The Simulator Tab

The script uses an **Update in Place** strategy for the Simulator. This means your **manually created charts are preserved** every time the script runs. Only the underlying prices and current quantities are refreshed.

## 🤝 Contributing

Have you dealt with a complex ticker change or a recent OPA? Help the community by updating the files in `src/config` and submitting a Pull Request.

## ⚖️ License

MIT
