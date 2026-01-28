export interface CsvTransaction {
  Data: string;
  "Tipo de Movimentação": string;
  Ativo: string;
  Quantidade: string;
  Valor: string;
  Preço?: string;
}

export interface Transaction {
  id?: string;
  date: Date;
  type:
    | "BUY"
    | "SELL"
    | "SPLIT"
    | "REVERSE_SPLIT"
    | "MERGER_OUT"
    | "MERGER_IN"
    | "FORCED_SALE";
  ticker: string;
  quantity: number;
  unitPrice: number; // Read from file
  totalValue: number;
  sourceFile?: string;
}

export interface SplitEvent {
  date: Date;
  ticker: string;
  numerator: number;
  denominator: number;
  ratio: number;
}

export interface MergerEvent {
  date: Date;
  oldTicker: string;
  newTicker: string;
  ratio: number;
}

export interface ForcedExitEvent {
  date: Date;
  ticker: string;
  price: number;
}

export interface LedgerRow {
  Date: string | Date;
  Action: string;
  Ticker: string;
  Quantity: number;
  "Unit Price": number;
  "Total Value": number;
  Source: string;
  "Original File": string;
}

export interface AssetProfile {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  quoteType: string;
  assetClass: "STOCK" | "FII";
}
