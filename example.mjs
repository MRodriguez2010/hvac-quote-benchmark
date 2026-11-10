import {
  resolveQuotePricingBenchmark, deterministicQuoteFairnessVerdict,
} from "./dist/benchmark.js";

export const catalog = [{
  id: "sample-3t", name: "Example heat pump", systemType: "heat_pump",
  tonnage: 3, price: 5000,
  pricing: {
    confidence: "verified", comparisonEligible: true, breakdown: {},
    installedPrice: 7000, installedPriceLow: 6500, installedPriceHigh: 7500,
  },
}];

export const examples = [
  { label: "Matching equipment and scope", requestedProductId: "sample-3t", competitor: { systemType: "heat_pump", tonnage: 3 } },
  { label: "Additional ductwork", requestedProductId: "sample-3t", competitor: { systemType: "heat_pump", tonnage: 3, lineItems: [{ description: "Replace ductwork" }] } },
  { label: "Planning proxy", competitor: { systemType: "heat_pump", tonnage: 3 } },
];
export function evaluate(input) {
  const match = resolveQuotePricingBenchmark(catalog, input);
  return { match: match.matchMode, verdict: deterministicQuoteFairnessVerdict(match, 8000), reasons: match.scopeReviewReasons };
}
