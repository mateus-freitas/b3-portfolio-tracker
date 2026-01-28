import { Transaction, SplitEvent, MergerEvent, ForcedExitEvent } from "./types";
import { normalizeTicker } from "./b3-service";

interface LedgerItem extends Transaction {
  isVirtual: boolean;
}

type Event =
  | { kind: "TX"; date: Date; payload: Transaction }
  | { kind: "SPLIT"; date: Date; payload: SplitEvent }
  | { kind: "MERGER"; date: Date; payload: MergerEvent }
  | { kind: "EXIT"; date: Date; payload: ForcedExitEvent };

export class LedgerProcessor {
  static process(
    history: Transaction[],
    splits: SplitEvent[],
    mergers: MergerEvent[],
    exits: ForcedExitEvent[],
  ): LedgerItem[] {
    const ledger: LedgerItem[] = [];
    const holdings = new Map<string, number>();

    const timeline: Event[] = [
      ...history.map((t) => ({
        kind: "TX" as const,
        date: t.date,
        payload: t,
      })),
      ...splits.map((s) => ({
        kind: "SPLIT" as const,
        date: s.date,
        payload: s,
      })),
      ...mergers.map((m) => ({
        kind: "MERGER" as const,
        date: m.date,
        payload: m,
      })),
      ...exits.map((e) => ({
        kind: "EXIT" as const,
        date: e.date,
        payload: e,
      })),
    ];

    timeline.sort((a, b) => {
      const timeDiff = a.date.getTime() - b.date.getTime();
      if (timeDiff !== 0) return timeDiff;

      const priority = {
        SPLIT: 1,
        MERGER: 2,
        TX: 3,
        EXIT: 4,
      };

      return priority[a.kind] - priority[b.kind];
    });

    for (const event of timeline) {
      if (event.kind === "TX") {
        const tx = event.payload;
        ledger.push({ ...tx, isVirtual: false });

        const currentQty = holdings.get(tx.ticker) || 0;
        let qtyChange = 0;
        if (tx.type === "BUY") qtyChange = tx.quantity;
        else if (tx.type === "SELL") qtyChange = -tx.quantity;
        // Other types shouldn't be in raw files but safety check

        holdings.set(tx.ticker, currentQty + qtyChange);
      } else if (event.kind === "SPLIT") {
        const split = event.payload;
        const currentQty = holdings.get(split.ticker) || 0;

        if (currentQty > 0) {
          const newQty = currentQty * split.ratio;
          const adjustment = newQty - currentQty;

          if (adjustment !== 0) {
            const type = split.ratio > 1 ? "SPLIT" : "REVERSE_SPLIT";
            ledger.push({
              date: split.date,
              type: type,
              ticker: split.ticker,
              quantity: Math.abs(adjustment),
              unitPrice: 0,
              totalValue: 0,
              sourceFile: "GENERATED_SPLIT",
              isVirtual: true,
            });
            holdings.set(split.ticker, newQty);
          }
        }
      } else if (event.kind === "MERGER") {
        const merger = event.payload;
        const oldTicker = normalizeTicker(merger.oldTicker);
        const newTicker = normalizeTicker(merger.newTicker);

        const oldQty = holdings.get(oldTicker) || 0;

        if (oldQty > 0) {
          const newQty = oldQty * merger.ratio;

          ledger.push({
            date: merger.date,
            type: "MERGER_OUT",
            ticker: oldTicker,
            quantity: oldQty, // Full exit
            unitPrice: 0,
            totalValue: 0,
            sourceFile: "GENERATED_MERGER",
            isVirtual: true,
          });
          holdings.set(oldTicker, 0);

          ledger.push({
            date: merger.date,
            type: "MERGER_IN",
            ticker: newTicker,
            quantity: newQty,
            unitPrice: 0,
            totalValue: 0,
            sourceFile: "GENERATED_MERGER",
            isVirtual: true,
          });
          const existingNewQty = holdings.get(newTicker) || 0;
          holdings.set(newTicker, existingNewQty + newQty);
        }
      } else if (event.kind === "EXIT") {
        const exit = event.payload;
        const ticker = normalizeTicker(exit.ticker);
        const currentQty = holdings.get(ticker) || 0;

        if (currentQty > 0) {
          ledger.push({
            date: exit.date,
            type: "FORCED_SALE",
            ticker: ticker,
            quantity: currentQty,
            unitPrice: exit.price, // Exit price from config
            totalValue: currentQty * exit.price,
            sourceFile: "GENERATED_EXIT",
            isVirtual: true,
          });
          holdings.set(ticker, 0);
        }
      }
    }

    return ledger;
  }
}
