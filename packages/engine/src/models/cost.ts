// Cost of one call from the `prices` table in models.json (§9.2: a new model needs only its price row).
import type { ModelPrice, ModelsConfig, Usage } from "@gw/shared";

/**
 * `usage.input` counts uncached input only; cache reads and writes are billed at their own rates.
 * The long-context rate applies to the whole request once its total input passes the threshold.
 */
export function costUsd(price: ModelPrice, usage: Usage): number {
  const totalIn = usage.input + usage.cache_read + usage.cache_write;
  const long = price.long_context_over_tokens !== null && totalIn > price.long_context_over_tokens;
  const inMul = long ? (price.long_context_multiplier ?? 1) : 1;
  const outMul = long ? (price.long_context_output_multiplier ?? price.long_context_multiplier ?? 1) : 1;
  const usd =
    (usage.input * price.input_per_mtok * inMul +
      usage.cache_read * price.cache_read_per_mtok * inMul +
      usage.cache_write * price.cache_write_per_mtok * inMul +
      usage.output * price.output_per_mtok * outMul) /
    1_000_000;
  return Math.round(usd * 1e12) / 1e12;
}

export function priceOf(config: ModelsConfig, model: string): ModelPrice {
  const price = config.prices[model];
  if (!price) throw new Error(`model "${model}" has no prices row in models.json`);
  return price;
}
