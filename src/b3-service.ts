import YahooFinance from "yahoo-finance2";
import { SplitEvent } from "./types";

export const normalizeTicker = (ticker: string): string => {
  let cleanTicker = ticker.trim().toUpperCase();

  if (cleanTicker.endsWith(".SA")) {
    return cleanTicker;
  }

  // Remove 'F' suffix if it exists (e.g. ITUB4F -> ITUB4, ALUP11F -> ALUP11)
  if (cleanTicker.endsWith("F") && cleanTicker.length > 4) {
    cleanTicker = cleanTicker.slice(0, -1);
  }
  return `${cleanTicker}.SA`;
};

export const fetchSplits = async (
  tickers: string[],
  startDate: string = "2020-01-01",
): Promise<SplitEvent[]> => {
  const allSplits: SplitEvent[] = [];

  console.log(`Fetching split data for ${tickers.length} tickers...`);
  for (const ticker of tickers) {
    try {
      const yf = new YahooFinance();
      const result = await yf.chart(ticker, {
        period1: startDate,
        events: "splits",
        interval: "1d",
      });

      if (result.events && result.events.splits) {
        const splits = result.events.splits;

        const splitList = Array.isArray(splits)
          ? splits
          : Object.values(splits);

        splitList.forEach((split: any) => {
          let eventDate: Date;

          if (split.date instanceof Date) {
            eventDate = split.date;
          } else if (typeof split.date === "number") {
            eventDate =
              split.date < 100000000000
                ? new Date(split.date * 1000)
                : new Date(split.date);
          } else {
            eventDate = new Date(split.date);
          }

          allSplits.push({
            date: eventDate,
            ticker: ticker,
            numerator: split.numerator,
            denominator: split.denominator,
            ratio: split.numerator / split.denominator,
          });
        });
      }
    } catch (error) {
      // Ignored
    }
  }

  return allSplits;
};
