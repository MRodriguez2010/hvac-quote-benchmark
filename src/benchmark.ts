export type QuoteBenchmarkBreakdown = {
  equipment?: number;
  materials?: number;
  materialMarkup?: number;
  laborHours?: number;
  labor?: number;
  miscellaneous?: number;
  permit?: number;
  disposal?: number;
  adjustments?: Array<{
    label?: string;
    customerLabel?: string;
    amount?: number;
  }>;
  contingency?: number;
  warrantyReserve?: number;
  rebate?: number;
};

export type QuoteBenchmarkPricing = {
  pricingBookId?: string | null;
  pricingBookName?: string | null;
  installedPriceLow?: number;
  installedPrice?: number;
  installedPriceHigh?: number;
  confidence: string;
  comparisonEligible?: boolean;
  disclosure?: string;
  breakdown?: QuoteBenchmarkBreakdown | null;
};

export type QuoteBenchmarkProduct = {
  id: string;
  brand?: string | null;
  name?: string | null;
  systemType?: string | null;
  tier?: string | null;
  price: number;
  tonnage?: string | number | null;
  seerRating?: string | number | null;
  afueRating?: string | number | null;
  pricing: QuoteBenchmarkPricing;
};

export type QuoteBenchmarkLineItem = {
  description?: unknown;
  amount?: unknown;
};

export type QuoteBenchmarkCompetitor = {
  systemType?: unknown;
  tonnage?: unknown;
  seerRating?: unknown;
  afueRating?: unknown;
  totalPrice?: unknown;
  lineItems?: QuoteBenchmarkLineItem[] | null;
};

export type QuotePricingBenchmarkMode =
  | "exact"
  | "same_system_proxy"
  | "none";

export type QuotePricingBenchmarkReason =
  | "requested_product_configured"
  | "requested_product_unconfigured"
  | "requested_product_system_mismatch"
  | "requested_product_not_found"
  | "no_requested_product"
  | "no_target_system_type"
  | "no_configured_same_system_product";

export type QuotePricingBenchmarkResolution<
  T extends QuoteBenchmarkProduct = QuoteBenchmarkProduct,
> = {
  matchMode: QuotePricingBenchmarkMode;
  reason: QuotePricingBenchmarkReason;
  product: T | null;
  requestedProduct: T | null;
  requestedProductId: string | null;
  targetSystemType: string | null;
  scopeComparable: boolean;
  scopeReviewReasons: string[];
};

export type QuotePricingBenchmarkPolicy = {
  hasCostBookBenchmark: boolean;
  allowSavingsAndVerdict: boolean;
};

export type ResolveQuotePricingBenchmarkInput = {
  requestedProductId?: unknown;
  competitor?: QuoteBenchmarkCompetitor | null;
};

const TIER_ORDER: Record<string, number> = {
  good: 0,
  better: 1,
  best: 2,
};

const NOTABLE_SCOPE_PATTERN =
  /\b(duct|permit|inspection|test|testing|line[\s-]?set|air cleaner|filter|thermostat|electrical|disconnect|drain|condensate|pad|platform|crane|warranty|zoning|damper)\b/i;
const STAFF_REVIEW_SCOPE_PATTERN =
  /\b(ductwork|duct\s+(?:replace|replacement|redesign)|replace[^.\n]{0,40}\bduct|zon(?:e|ed|ing)|damper\s+(?:replace|replacement|install)|crane|roof(?:top)?\s+(?:work|curb|penetration)|electrical\s+(?:service|panel|upgrade)|structural|asbestos|gas\s+(?:line|piping|conversion)|vent(?:ing)?\s+(?:replace|replacement|redesign))\b/i;

function finiteNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstNumber(value: unknown): number | null {
  if (typeof value === "number") return finiteNumber(value);
  const match = String(value ?? "").match(/-?\d+(?:\.\d+)?/);
  return match ? finiteNumber(match[0]) : null;
}

function normalizedCode(value: unknown): string | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized || null;
}

function configuredForCostBook(product: QuoteBenchmarkProduct): boolean {
  return (
    product.pricing.confidence !== "catalog_fallback" &&
    product.pricing.breakdown !== null &&
    product.pricing.breakdown !== undefined
  );
}

function verifiedForComparison(product: QuoteBenchmarkProduct): boolean {
  return (
    product.pricing.confidence === "verified" &&
    product.pricing.comparisonEligible !== false
  );
}

function comparableMetric(
  candidate: unknown,
  target: unknown,
  tolerance: number
) {
  const candidateNumber = firstNumber(candidate);
  const targetNumber = firstNumber(target);
  if (candidateNumber === null || targetNumber === null) return false;
  return Math.abs(candidateNumber - targetNumber) <= tolerance;
}

function scopeReview(
  product: QuoteBenchmarkProduct,
  competitor: QuoteBenchmarkCompetitor
) {
  const reasons: string[] = [];
  const productSystem = normalizedCode(product.systemType);
  const competitorSystem = normalizedCode(competitor.systemType);
  if (!competitorSystem) {
    reasons.push("The uploaded quote does not identify a system type.");
  } else if (!productSystem || productSystem !== competitorSystem) {
    reasons.push("The system types are not an exact match.");
  }

  if (firstNumber(product.tonnage) !== null) {
    if (firstNumber(competitor.tonnage) === null) {
      reasons.push("The uploaded quote does not identify equipment tonnage.");
    } else if (!comparableMetric(product.tonnage, competitor.tonnage, 0.05)) {
      reasons.push("The equipment tonnage differs.");
    }
  }

  if (
    firstNumber(product.afueRating) !== null &&
    firstNumber(competitor.afueRating) !== null &&
    !comparableMetric(product.afueRating, competitor.afueRating, 3)
  ) {
    reasons.push("The heating efficiency differs materially.");
  }
  if (
    firstNumber(product.seerRating) !== null &&
    firstNumber(competitor.seerRating) !== null &&
    !comparableMetric(product.seerRating, competitor.seerRating, 1.5)
  ) {
    reasons.push("The cooling efficiency differs materially.");
  }

  const staffReviewScope = Array.isArray(competitor.lineItems)
    ? competitor.lineItems
        .map((item) => String(item?.description ?? "").replace(/\s+/g, " "))
        .find((description) => STAFF_REVIEW_SCOPE_PATTERN.test(description))
    : null;
  if (staffReviewScope) {
    reasons.push(
      "The quote includes scope that requires a project-specific staff review."
    );
  }

  return { comparable: reasons.length === 0, reasons };
}

function metricDistance(
  candidate: unknown,
  target: unknown
): readonly [missing: number, distance: number] {
  const targetNumber = firstNumber(target);
  if (targetNumber === null) return [0, 0];
  const candidateNumber = firstNumber(candidate);
  if (candidateNumber === null) return [1, Number.POSITIVE_INFINITY];
  return [0, Math.abs(candidateNumber - targetNumber)];
}

function tierDistance(candidate: unknown, target: unknown): number {
  const candidateTier = TIER_ORDER[normalizedCode(candidate) ?? ""];
  const targetTier = TIER_ORDER[normalizedCode(target) ?? ""];
  if (candidateTier === undefined || targetTier === undefined) return 0;
  return Math.abs(candidateTier - targetTier);
}

function compareNumbers(left: number, right: number): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareProxyCandidates(
  left: QuoteBenchmarkProduct,
  right: QuoteBenchmarkProduct,
  requestedProduct: QuoteBenchmarkProduct | null,
  competitor: QuoteBenchmarkCompetitor
): number {
  const leftTonnage = metricDistance(left.tonnage, competitor.tonnage);
  const rightTonnage = metricDistance(right.tonnage, competitor.tonnage);
  const leftAfue = metricDistance(left.afueRating, competitor.afueRating);
  const rightAfue = metricDistance(right.afueRating, competitor.afueRating);
  const leftSeer = metricDistance(left.seerRating, competitor.seerRating);
  const rightSeer = metricDistance(right.seerRating, competitor.seerRating);
  const comparisons: Array<[number, number]> = [
    [leftTonnage[0], rightTonnage[0]],
    [leftTonnage[1], rightTonnage[1]],
    [leftAfue[0], rightAfue[0]],
    [leftAfue[1], rightAfue[1]],
    [leftSeer[0], rightSeer[0]],
    [leftSeer[1], rightSeer[1]],
    [
      tierDistance(left.tier, requestedProduct?.tier),
      tierDistance(right.tier, requestedProduct?.tier),
    ],
    [
      requestedProduct
        ? Math.abs(left.price - requestedProduct.price)
        : left.price,
      requestedProduct
        ? Math.abs(right.price - requestedProduct.price)
        : right.price,
    ],
  ];

  for (const [leftValue, rightValue] of comparisons) {
    const result = compareNumbers(leftValue, rightValue);
    if (result !== 0) return result;
  }
  return left.id.localeCompare(right.id);
}

/**
 * Resolves the product whose cost-book pricing can safely be shown for an
 * extracted competitor quote.
 *
 * An exact configured product is preferred. When the extracted product has no
 * cost profile, the resolver may return a configured product from the same
 * system type as a planning benchmark. It never crosses system types.
 */
export function resolveQuotePricingBenchmark<
  T extends QuoteBenchmarkProduct,
>(
  products: readonly T[],
  input: ResolveQuotePricingBenchmarkInput
): QuotePricingBenchmarkResolution<T> {
  const requestedProductId =
    typeof input.requestedProductId === "string" &&
    input.requestedProductId.trim()
      ? input.requestedProductId.trim()
      : null;
  const requestedProduct =
    (requestedProductId
      ? products.find((product) => product.id === requestedProductId)
      : null) ?? null;
  const competitor = input.competitor ?? {};
  const competitorSystemType = normalizedCode(competitor.systemType);
  const requestedSystemType = normalizedCode(requestedProduct?.systemType);
  const targetSystemType = competitorSystemType ?? requestedSystemType;
  const requestedSystemMatches =
    !competitorSystemType ||
    !requestedSystemType ||
    competitorSystemType === requestedSystemType;

  if (
    requestedProduct &&
    requestedSystemMatches &&
    configuredForCostBook(requestedProduct)
  ) {
    const scope = scopeReview(requestedProduct, competitor);
    return {
      matchMode: "exact",
      reason: "requested_product_configured",
      product: requestedProduct,
      requestedProduct,
      requestedProductId,
      targetSystemType,
      scopeComparable: scope.comparable,
      scopeReviewReasons: scope.reasons,
    };
  }

  if (!targetSystemType) {
    return {
      matchMode: "none",
      reason: "no_target_system_type",
      product: null,
      requestedProduct,
      requestedProductId,
      targetSystemType: null,
      scopeComparable: false,
      scopeReviewReasons: ["A comparable system type could not be established."],
    };
  }

  const configuredSameSystem = products
    .filter(
      (product) =>
        normalizedCode(product.systemType) === targetSystemType &&
        configuredForCostBook(product)
    )
    .slice()
    .sort((left, right) =>
      compareProxyCandidates(left, right, requestedProduct, competitor)
    );
  const product = configuredSameSystem[0] ?? null;

  if (!product) {
    return {
      matchMode: "none",
      reason: "no_configured_same_system_product",
      product: null,
      requestedProduct,
      requestedProductId,
      targetSystemType,
      scopeComparable: false,
      scopeReviewReasons: [
        "The active cost book has no modeled product for this system type.",
      ],
    };
  }

  const reason: QuotePricingBenchmarkReason = requestedProduct
    ? requestedSystemMatches
      ? "requested_product_unconfigured"
      : "requested_product_system_mismatch"
    : requestedProductId
      ? "requested_product_not_found"
      : "no_requested_product";

  return {
    matchMode: "same_system_proxy",
    reason,
    product,
    requestedProduct,
    requestedProductId,
    targetSystemType,
    scopeComparable: false,
    scopeReviewReasons: [
      "A same-system planning proxy is not an exact product and scope match.",
    ],
  };
}

/**
 * A same-system proxy proves that the active cost book was applied, but it is
 * deliberately not enough for a savings claim or fairness verdict.
 */
export function quotePricingBenchmarkPolicy<
  T extends QuoteBenchmarkProduct,
>(
  resolution: QuotePricingBenchmarkResolution<T>
): QuotePricingBenchmarkPolicy {
  const hasCostBookBenchmark = Boolean(
    resolution.product &&
      configuredForCostBook(resolution.product)
  );
  return {
    hasCostBookBenchmark,
    allowSavingsAndVerdict:
      hasCostBookBenchmark &&
      resolution.matchMode === "exact" &&
      resolution.scopeComparable &&
      Boolean(resolution.product && verifiedForComparison(resolution.product)),
  };
}

export type DeterministicFairnessVerdict =
  | "fair"
  | "high"
  | "low"
  | "unclear";

export function deterministicQuoteFairnessVerdict<
  T extends QuoteBenchmarkProduct,
>(
  resolution: QuotePricingBenchmarkResolution<T>,
  competitorTotal: unknown
): DeterministicFairnessVerdict {
  const policy = quotePricingBenchmarkPolicy(resolution);
  const total = finiteNumber(competitorTotal);
  const product = resolution.product;
  if (
    !policy.allowSavingsAndVerdict ||
    total === null ||
    total <= 0 ||
    !product
  ) {
    return "unclear";
  }
  const low =
    finiteNumber(product.pricing.installedPriceLow) ??
    finiteNumber(product.pricing.installedPrice);
  const high =
    finiteNumber(product.pricing.installedPriceHigh) ??
    finiteNumber(product.pricing.installedPrice);
  if (low === null || high === null) return "unclear";
  if (total < low) return "low";
  if (total > high) return "high";
  return "fair";
}

function money(value: unknown): string | null {
  const amount = finiteNumber(value);
  if (amount === null) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function productName(product: QuoteBenchmarkProduct): string {
  return [product.brand, product.name].filter(Boolean).join(" ").trim() ||
    product.id;
}

function notableScopeItems(
  competitor: QuoteBenchmarkCompetitor
): Array<{ description: string; amount: number }> {
  if (!Array.isArray(competitor.lineItems)) return [];
  return competitor.lineItems
    .map((item) => ({
      description: String(item?.description ?? "")
        .replace(/\*\*/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 180),
      amount: finiteNumber(item?.amount),
    }))
    .filter(
      (
        item
      ): item is {
        description: string;
        amount: number;
      } =>
        Boolean(item.description) &&
        item.amount !== null &&
        item.amount > 0 &&
        NOTABLE_SCOPE_PATTERN.test(item.description)
    )
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 3);
}

export type BuildQuotePricingBenchmarkSummaryInput<
  T extends QuoteBenchmarkProduct = QuoteBenchmarkProduct,
> = {
  resolution: QuotePricingBenchmarkResolution<T>;
  competitor?: QuoteBenchmarkCompetitor | null;
};

/**
 * Produces deterministic customer-facing copy from the current cost book.
 * Proxy copy intentionally makes no savings claim and no fairness verdict.
 */
export function buildQuotePricingBenchmarkSummary<
  T extends QuoteBenchmarkProduct,
>({
  resolution,
  competitor = {},
}: BuildQuotePricingBenchmarkSummaryInput<T>): string {
  const product = resolution.product;
  if (!product) {
    return "We extracted the quote details, but the active U1 Mechanical labor and material cost book does not yet contain a same-system benchmark for a responsible price comparison. Staff can review the equipment and job scope before giving you a fair verdict.";
  }

  const displayName = productName(product);
  const installedPrice =
    money(product.pricing.installedPrice) ?? money(product.price);
  const modelSentence =
    " The planning model includes equipment, standard labor and materials, permit, disposal, contingency, and warranty reserve allowances.";

  if (resolution.matchMode === "exact") {
    const policy = quotePricingBenchmarkPolicy(resolution);
    const disclosure = String(product.pricing.disclosure ?? "").trim();
    const reviewReason = resolution.scopeReviewReasons[0];
    const verdictSentence = policy.allowSavingsAndVerdict
      ? " This exact, verified, comparable-scope baseline can support the deterministic price verdict shown here."
      : ` This is planning context only; no savings claim or price verdict is presented${reviewReason ? ` because ${reviewReason.charAt(0).toLowerCase()}${reviewReason.slice(1)}` : ""}.`;
    return `The active U1 Mechanical cost book was applied to the matching **${displayName}**${installedPrice ? ` at **${installedPrice}**` : ""}.${modelSentence}${disclosure ? ` ${disclosure}` : ""}${verdictSentence}`;
  }

  const requestedName = resolution.requestedProduct
    ? productName(resolution.requestedProduct)
    : null;
  const mismatchSentence = requestedName
    ? ` The uploaded equipment most closely matched **${requestedName}**, which does not yet have a product-specific cost profile.`
    : " The uploaded quote did not identify an exact U1 product with a configured cost profile.";
  const scope = notableScopeItems(competitor ?? {});
  const scopeSentence = scope.length
    ? ` Additional quoted scope includes ${scope
        .map(
          (item) =>
            `${item.description} (**${money(item.amount) ?? item.amount}**)`
        )
        .join(", ")}.`
    : "";

  return `The active U1 Mechanical cost book was applied to the same-system **${displayName}** planning baseline${installedPrice ? ` at **${installedPrice}**` : ""}.${modelSentence}${mismatchSentence}${scopeSentence} Because the equipment profile or job scope differs, this benchmark is provided for context; no savings claim or price verdict is presented.`;
}
