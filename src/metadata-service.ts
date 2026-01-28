import fs from "fs";
import path from "path";
import YahooFinance from "yahoo-finance2";
import { AssetProfile } from "./types";

const CACHE_FILE = "asset_profiles_cache.json";
const KNOWN_UNITS = new Set([
  "TAEE11",
  "ALUP11",
  "KLBN11",
  "SAPR11",
  "SANB11",
  "AESB11",
  "TIET11",
  "ENGI11",
  "CPLE11",
]);

export class MetadataService {
  private static loadCache(): Record<string, AssetProfile> {
    if (fs.existsSync(CACHE_FILE)) {
      try {
        return JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
      } catch (e) {
        console.warn("⚠️ Failed to load cache, starting fresh.");
      }
    }
    return {};
  }

  private static saveCache(cache: Record<string, AssetProfile>) {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  }

  static async getProfiles(
    tickers: string[],
  ): Promise<Map<string, AssetProfile>> {
    const cache = this.loadCache();
    const profiles = new Map<string, AssetProfile>();
    const missingTickers: string[] = [];

    for (const ticker of tickers) {
      if (cache[ticker]) {
        profiles.set(ticker, cache[ticker]!);
      } else {
        missingTickers.push(ticker);
      }
    }

    if (missingTickers.length > 0) {
      console.log(
        `🌍 Fetching metadata for ${missingTickers.length} tickers...`,
      );

      for (const ticker of missingTickers) {
        try {
          const queryTicker = ticker.endsWith(".SA") ? ticker : ticker + ".SA";

          const yf = new YahooFinance();
          const result = (await yf.quoteSummary(queryTicker, {
            modules: ["summaryProfile", "quoteType", "price"],
          })) as any;

          const profile = result.summaryProfile;
          const quoteType = result.quoteType;
          const price = result.price;

          const longName = quoteType?.longName || price?.longName || ticker;
          const sector = profile?.sector || "Unknown";
          const industry = profile?.industry || "Unknown";
          const qType = quoteType?.quoteType || "EQUITY";

          const assetClass = this.determineAssetClass(ticker, longName, qType);

          const assetProfile: AssetProfile = {
            ticker,
            name: longName,
            sector,
            industry,
            quoteType: qType,
            assetClass,
          };

          cache[ticker] = assetProfile;
          profiles.set(ticker, assetProfile);
        } catch (error) {
          console.warn(
            `⚠️ Failed to fetch metadata for ${ticker}:`,
            error instanceof Error ? error.message : error,
          );
          const fallback: AssetProfile = {
            ticker,
            name: ticker,
            sector: "Unknown",
            industry: "Unknown",
            quoteType: "Unknown",
            assetClass: this.determineAssetClass(ticker, ticker, "Unknown"),
          };
          cache[ticker] = fallback;
          profiles.set(ticker, fallback);
        }
      }

      this.saveCache(cache);
    }

    return profiles;
  }

  private static determineAssetClass(
    ticker: string,
    name: string,
    quoteType: string,
  ): "STOCK" | "FII" {
    const upperName = name.toUpperCase();
    const cleanTicker = ticker.replace(".SA", "").toUpperCase();

    if (
      upperName.includes("FUNDO INVEST") ||
      upperName.includes("INV IMOB") ||
      upperName.includes("FII")
    ) {
      return "FII";
    }

    if (cleanTicker.endsWith("11")) {
      if (KNOWN_UNITS.has(cleanTicker)) {
        return "STOCK";
      }
      return "FII";
    }

    return "STOCK";
  }
}
