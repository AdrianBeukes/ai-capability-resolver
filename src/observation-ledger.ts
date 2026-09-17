import { createHash } from "node:crypto";

/** Phase 11A: immutable, protocol-neutral observations and pure measurements. */
export type ObservationExecutionMode = "simulated" | "external";
export type ObservationSource = "verification" | "execution" | "fixture" | "other";
export type FailureCategory = "network_failure" | "timeout" | "transport_rejected" | "authentication_required" | "payment_required" | "payment_mismatch" | "malformed_response" | "execution_error" | "canonical_incompatible" | "unsafe" | "unknown";

export interface CapabilityObservationRecord {
  readonly observationId: string; readonly capabilityId: string; readonly providerId: string; readonly resourceId?: string;
  readonly observedAt: string; readonly executionMode: ObservationExecutionMode; readonly source: ObservationSource;
  readonly requestFingerprint?: string; readonly contractFingerprint?: string;
  readonly transport: { readonly attempted: boolean; readonly reached?: boolean; readonly status?: number; readonly latencyMs?: number };
  readonly execution: { readonly attempted: boolean; readonly succeeded?: boolean; readonly failureCategory?: FailureCategory };
  readonly canonicalOutput: { readonly evaluated: boolean; readonly succeeded?: boolean; readonly incompatibilityCategory?: FailureCategory };
  readonly payment?: { readonly applicable: boolean; readonly quoteObserved?: boolean; readonly quoteMatched?: boolean };
  readonly provenance?: Readonly<Record<string, string>>;
}
export type CapabilityObservationInput = CapabilityObservationRecord;

const MAX_LATENCY_MS = 2_147_483_647;
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map(k => [k, stable((value as Record<string, unknown>)[k])]));
  return value;
}
function digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex"); }
/** Hashes only canonicalized stable advertised-contract material supplied by the caller. */
export function deriveContractFingerprint(contractMaterial: unknown): string | undefined {
  if (contractMaterial === undefined || contractMaterial === null) return undefined;
  return `sha256:${digest(contractMaterial)}`;
}
function requestShape(value: unknown): unknown {
  if (value === null) return "null";
  if (Array.isArray(value)) return [value.length === 0 ? "empty" : requestShape(value[0])];
  switch (typeof value) {
    case "string": return "string"; case "boolean": return "boolean"; case "number": return Number.isInteger(value) ? "integer" : "number";
    case "object": return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map(k => [k, requestShape((value as Record<string, unknown>)[k])]));
    default: return typeof value;
  }
}
/** Returns structural types only; raw request values are never serialized into this fingerprint. */
export function deriveRequestFingerprint(capabilityId: string, request: unknown): string {
  return `sha256:${digest({ capabilityId, shape: requestShape(request) })}`;
}
function cloneFreeze<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(cloneFreeze)) as T;
  if (value && typeof value === "object") return Object.freeze(Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, cloneFreeze(child)]))) as T;
  return value;
}
function copy(record: CapabilityObservationRecord): CapabilityObservationRecord {
  return cloneFreeze({ ...record, transport: { ...record.transport }, execution: { ...record.execution }, canonicalOutput: { ...record.canonicalOutput }, ...(record.payment ? { payment: { ...record.payment } } : {}), ...(record.provenance ? { provenance: { ...record.provenance } } : {}) });
}
export function createObservationRecord(input: CapabilityObservationInput): CapabilityObservationRecord {
  if (!input.observationId || !input.capabilityId || !input.providerId) throw new Error("observation identity fields are required");
  if (Number.isNaN(Date.parse(input.observedAt))) throw new Error("observedAt must be a valid timestamp");
  const t = input.transport;
  if (t.reached !== undefined && !t.attempted) throw new Error("transport reached requires attempted transport");
  if (t.status !== undefined && (!Number.isInteger(t.status) || t.status < 100 || t.status > 999)) throw new Error("transport status must be an HTTP-like status");
  if (t.latencyMs !== undefined && (!Number.isFinite(t.latencyMs) || t.latencyMs < 0 || t.latencyMs > MAX_LATENCY_MS)) throw new Error("latencyMs must be finite, non-negative, and bounded");
  if (input.execution.succeeded !== undefined && !input.execution.attempted) throw new Error("execution result requires attempted execution");
  if (input.execution.failureCategory !== undefined && !input.execution.attempted) throw new Error("execution failure requires attempted execution");
  if (input.canonicalOutput.succeeded !== undefined && !input.canonicalOutput.evaluated) throw new Error("canonical result requires evaluation");
  if (input.canonicalOutput.incompatibilityCategory !== undefined && !input.canonicalOutput.evaluated) throw new Error("canonical incompatibility requires evaluation");
  if (input.payment?.quoteMatched && !input.payment.quoteObserved) throw new Error("quote match requires observed quote");
  return copy(input);
}

export interface EvidenceWindowDefinition { capabilityId: string; providerId: string; resourceId?: string; executionMode?: ObservationExecutionMode; fromInclusive?: string; toExclusive?: string; contractFingerprint?: string; requestFingerprint?: string; }
export interface EvidenceWindow { readonly definition: Readonly<EvidenceWindowDefinition & { executionMode: ObservationExecutionMode }>; readonly observations: readonly CapabilityObservationRecord[]; readonly selectedObservationIds: readonly string[]; readonly earliestObservedAt?: string; readonly latestObservedAt?: string; readonly countsByEvidenceType: Readonly<{ quoteObservations: number; executionObservations: number; canonicalEvaluations: number }>; readonly contractFingerprints: readonly string[]; readonly unknownContractObservations: number; readonly mixedContracts: boolean; }
function timestampCheck(value: string | undefined, label: string) { if (value !== undefined && Number.isNaN(Date.parse(value))) throw new Error(`${label} must be a valid timestamp`); }
const timestamp = (value: string) => Date.parse(value);
export class ObservationLedger {
  private readonly records = new Map<string, CapabilityObservationRecord>();
  append(record: CapabilityObservationInput): CapabilityObservationRecord { const immutable = createObservationRecord(record); if (this.records.has(immutable.observationId)) throw new Error(`duplicate observationId: ${immutable.observationId}`); this.records.set(immutable.observationId, immutable); return copy(immutable); }
  appendMany(records: readonly CapabilityObservationInput[]): readonly CapabilityObservationRecord[] {
    const immutable = records.map(createObservationRecord), ids = new Set<string>();
    for (const record of immutable) { if (ids.has(record.observationId) || this.records.has(record.observationId)) throw new Error(`duplicate observationId: ${record.observationId}`); ids.add(record.observationId); }
    immutable.forEach(record => this.records.set(record.observationId, record));
    return immutable.map(copy);
  }
  all(): readonly CapabilityObservationRecord[] { return [...this.records.values()].sort((a,b) => a.observationId.localeCompare(b.observationId)).map(copy); }
  select(definition: EvidenceWindowDefinition): EvidenceWindow {
    timestampCheck(definition.fromInclusive, "fromInclusive"); timestampCheck(definition.toExclusive, "toExclusive");
    const resolved = { ...definition, executionMode: definition.executionMode ?? "external" };
    const from = resolved.fromInclusive === undefined ? undefined : timestamp(resolved.fromInclusive), to = resolved.toExclusive === undefined ? undefined : timestamp(resolved.toExclusive);
    const rows = [...this.records.values()].filter(r => r.capabilityId === resolved.capabilityId && r.providerId === resolved.providerId && (resolved.resourceId === undefined || r.resourceId === resolved.resourceId) && r.executionMode === resolved.executionMode && (resolved.contractFingerprint === undefined || r.contractFingerprint === resolved.contractFingerprint) && (resolved.requestFingerprint === undefined || r.requestFingerprint === resolved.requestFingerprint) && (from === undefined || timestamp(r.observedAt) >= from) && (to === undefined || timestamp(r.observedAt) < to)).sort((a,b) => a.observationId.localeCompare(b.observationId));
    const known = [...new Set(rows.flatMap(r => r.contractFingerprint ? [r.contractFingerprint] : []))].sort();
    const chronological = [...rows].sort((a,b) => timestamp(a.observedAt)-timestamp(b.observedAt) || a.observationId.localeCompare(b.observationId));
    return cloneFreeze({ definition: resolved, observations: rows.map(copy), selectedObservationIds: rows.map(r => r.observationId), earliestObservedAt: chronological.at(0)?.observedAt, latestObservedAt: chronological.at(-1)?.observedAt, countsByEvidenceType: { quoteObservations: rows.filter(r=>r.payment?.quoteObserved).length, executionObservations: rows.filter(r=>r.execution.attempted).length, canonicalEvaluations: rows.filter(r=>r.canonicalOutput.evaluated).length }, contractFingerprints: known, unknownContractObservations: rows.filter(r=>!r.contractFingerprint).length, mixedContracts: known.length > 1 });
  }
}
export interface LatencySummary { count: number; min: number; max: number; mean: number; }
export interface EvidenceMeasurements { totalObservations: number; transportAttempts: number; transportReached: number; quoteObservations: number; quoteMatches: number; quoteMismatches: number; executionAttempts: number; executionSuccesses: number; executionFailures: number; canonicalEvaluations: number; canonicalSuccesses: number; canonicalFailures: number; transportLatencySamples: number; transportLatency?: LatencySummary; earliestObservedAt?: string; latestObservedAt?: string; executionSuccessRatio?: number; canonicalSuccessRatio?: number; }
export function deriveEvidenceMeasurements(window: EvidenceWindow): EvidenceMeasurements {
  const r = window.observations, count = (fn:(x:CapabilityObservationRecord)=>boolean) => r.filter(fn).length;
  const latencies = r.flatMap(x => x.transport.latencyMs === undefined ? [] : [x.transport.latencyMs]);
  return { totalObservations:r.length, transportAttempts:count(x=>x.transport.attempted), transportReached:count(x=>x.transport.reached===true), quoteObservations:count(x=>x.payment?.quoteObserved===true), quoteMatches:count(x=>x.payment?.quoteMatched===true), quoteMismatches:count(x=>x.payment?.quoteObserved===true&&x.payment.quoteMatched===false), executionAttempts:count(x=>x.execution.attempted), executionSuccesses:count(x=>x.execution.succeeded===true), executionFailures:count(x=>x.execution.attempted&&x.execution.succeeded===false), canonicalEvaluations:count(x=>x.canonicalOutput.evaluated), canonicalSuccesses:count(x=>x.canonicalOutput.succeeded===true), canonicalFailures:count(x=>x.canonicalOutput.evaluated&&x.canonicalOutput.succeeded===false), transportLatencySamples:latencies.length, ...(latencies.length?{transportLatency:{count:latencies.length,min:Math.min(...latencies),max:Math.max(...latencies),mean:latencies.reduce((a,b)=>a+b,0)/latencies.length}}:{}), ...(window.earliestObservedAt?{earliestObservedAt:window.earliestObservedAt}:{}), ...(window.latestObservedAt?{latestObservedAt:window.latestObservedAt}:{}), ...(count(x=>x.execution.attempted)?{executionSuccessRatio:count(x=>x.execution.succeeded===true)/count(x=>x.execution.attempted)}:{}), ...(count(x=>x.canonicalOutput.evaluated)?{canonicalSuccessRatio:count(x=>x.canonicalOutput.succeeded===true)/count(x=>x.canonicalOutput.evaluated)}:{}) };
}
export interface EvidenceSufficiencyRequirement { minimumExecutionAttempts?: number; minimumCanonicalEvaluations?: number; minimumLatencySamples?: number; requireExternalMode?: boolean; requireSingleContractFingerprint?: boolean; }
export interface EvidenceSufficiencyResult { sufficient: boolean; reasonCodes: readonly string[]; missing: readonly string[]; }
export function assessEvidenceSufficiency(window: EvidenceWindow, requirement: EvidenceSufficiencyRequirement): EvidenceSufficiencyResult {
  const m=deriveEvidenceMeasurements(window), reasons:string[]=[], missing:string[]=[];
  const need=(actual:number, required:number|undefined, code:string)=>{if(required !== undefined && actual<required){reasons.push(code);missing.push(`${code}:${required-actual}`);}};
  need(m.executionAttempts,requirement.minimumExecutionAttempts,"minimum_execution_attempts"); need(m.canonicalEvaluations,requirement.minimumCanonicalEvaluations,"minimum_canonical_evaluations"); need(m.transportLatencySamples,requirement.minimumLatencySamples,"minimum_latency_samples");
  if(requirement.requireExternalMode && window.definition.executionMode!=="external"){reasons.push("external_mode_required");missing.push("external_mode");} if(requirement.requireSingleContractFingerprint && (window.mixedContracts || window.unknownContractObservations>0)){reasons.push("single_known_contract_required");missing.push("single_known_contract");}
  return {sufficient:!reasons.length,reasonCodes:reasons,missing};
}
