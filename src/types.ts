export const CURRENCY_CONVERSION = "currency_conversion" as const;
export const UNIT_CONVERSION = "unit_conversion" as const;
export const TEXT_STATISTICS = "text_statistics" as const;

export type CapabilityId = typeof CURRENCY_CONVERSION | typeof UNIT_CONVERSION | typeof TEXT_STATISTICS;

export type FieldSchema = Readonly<Record<string, string>>;

export interface CapabilityManifest {
  capability: {
    id: CapabilityId;
    name: string;
    description: string;
    version: string;
    inputSchema: FieldSchema;
    outputSchema: FieldSchema;
  };
  provider: {
    id: string;
    name: string;
  };
  pricing: {
    amount: number;
    currency: "USD";
    unit: "per_request";
  };
  estimatedLatencyMs: number;
  reliability: number;
  endpoint: {
    method: "POST";
    path: "/execute";
    action: string;
  };
}

export interface Provider {
  id: string;
  name: string;
  manifests: readonly CapabilityManifest[];
  price: number;
  estimatedLatencyMs: number;
  reliability: number;
  /** Present only for providers registered through HTTP discovery. */
  baseUrl?: string;
}

/** Caller-supplied, simulated execution constraints. These are never model-selected tool arguments. */
export interface ExecutionPolicy {
  maxPriceUsd?: number;
  minReliability?: number;
  maxLatencyMs?: number;
}

export type ProviderRejectionReason = "price_exceeds_maximum" | "reliability_below_minimum" | "latency_exceeds_maximum";

export interface ProviderRoutingSummary {
  providerId: string;
  priceUsd: number;
  reliability: number;
  estimatedLatencyMs: number;
}

export interface RejectedProvider extends ProviderRoutingSummary {
  reasons: ProviderRejectionReason[];
}

export interface EligibleProviderResolution {
  status: "eligible_provider";
  capability: CapabilityId;
  policy: ExecutionPolicy;
  selectedProvider: ProviderRoutingSummary;
  eligibleProviders: ProviderRoutingSummary[];
  rejectedProviders: RejectedProvider[];
}

export interface NoEligibleProviderResolution {
  status: "no_eligible_provider";
  capability: CapabilityId;
  policy: ExecutionPolicy;
  rejectedProviders: RejectedProvider[];
}

export type ProviderResolution = EligibleProviderResolution | NoEligibleProviderResolution;

export interface CurrencyConversionInput {
  amount: number;
  from: string;
  to: string;
}

export interface ExecutionRequest {
  capability: CapabilityId;
  providerId: string;
  input: CurrencyConversionInput;
}
