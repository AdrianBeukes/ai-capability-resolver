/**
 * Phase 10D: evidence from one execution.  This module deliberately does not
 * read or modify advertised schemas, classifications, or AdapterPlans.
 */
import type { MatchStatus } from "./classification.js";

export type ExecutionMode = "simulated" | "external";
export type CanonicalExtractionStatus = "success" | "partial" | "failed" | "ambiguous";
export type CanonicalValidationStatus = "valid" | "invalid" | "unknown";
export type ObservedOutcome = "canonical_success" | "structurally_informative" | "incompatible_response" | "malformed_response" | "execution_failed";

export interface ObservedShape {
  kind: "object" | "array" | "string" | "number" | "boolean" | "null" | "unknown";
  properties?: readonly { name: string; shape: ObservedShape }[];
  item?: ObservedShape;
  sampledItems?: number;
  truncated?: boolean;
}
export interface ObservedMapping { canonicalPath: string; observedPath: string; transformation: "identity" | "rename" | "nested_path" | "array_item_mapping"; evidence: readonly string[]; }
export interface ObservedCapabilityEvidence {
  capabilityId: "web.search";
  providerId: string;
  resourceId: string;
  observedAt: string;
  executionMode: ExecutionMode;
  requestEvidence: { canonicalInput?: { query: string }; nativeInputShape?: unknown; accepted: boolean };
  responseEvidence: { httpStatus?: number; contentType?: string; responseShape?: ObservedShape };
  canonicalExtraction: { status: CanonicalExtractionStatus; mappings: readonly ObservedMapping[]; missingRequiredFields: readonly string[]; diagnostics: readonly string[] };
  canonicalValidation: { status: CanonicalValidationStatus; diagnostics: readonly string[] };
  outcome: ObservedOutcome;
}
export interface SimulatedExecutionFixture { providerId: string; resourceId: string; observedAt: string; canonicalInput: { query: string }; nativeInput: unknown; httpStatus: number; contentType: string; body: unknown; reportedSuccess?: boolean; semanticStatus: MatchStatus; }

const LIMITS = { depth: 8, properties: 24, arraySamples: 3, stringLength: 160, diagnostics: 12 } as const;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const clean = (value: string): string => value.slice(0, LIMITS.stringLength).replace(/(authorization|token|secret|password)\s*[:=]\s*[^\s,]+/gi, "$1:[redacted]");

/** Bounded, value-minimising shape description; payload values are never retained. */
export function describeObservedShape(value: unknown, depth = 0): ObservedShape {
  if (depth >= LIMITS.depth) return { kind: "unknown", truncated: true };
  if (value === null) return { kind: "null" };
  if (Array.isArray(value)) {
    const samples = value.slice(0, LIMITS.arraySamples);
    return { kind: "array", sampledItems: samples.length, truncated: value.length > samples.length, item: samples.length ? describeObservedShape(samples[0], depth + 1) : undefined };
  }
  if (object(value)) {
    const entries = Object.entries(value).slice(0, LIMITS.properties);
    return { kind: "object", truncated: Object.keys(value).length > entries.length, properties: entries.map(([name, child]) => ({ name, shape: describeObservedShape(child, depth + 1) })) };
  }
  return { kind: typeof value as ObservedShape["kind"] };
}

interface Candidate { path: string; items: unknown[]; urlKey: string; titleKey?: string; snippetKey?: string; }
function candidates(value: unknown, prefix = "", depth = 0): Candidate[] {
  if (!object(value) || depth >= LIMITS.depth) return [];
  const found: Candidate[] = [];
  for (const [key, child] of Object.entries(value).slice(0, LIMITS.properties)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(child)) {
      const sample = child.slice(0, LIMITS.arraySamples);
      const first = sample.find(object);
      if (first) {
        const urlKey = ["url", "link", "href"].find(name => typeof first[name] === "string");
        if (urlKey) found.push({ path, items: child, urlKey, titleKey: ["title", "name"].find(name => typeof first[name] === "string"), snippetKey: ["snippet", "description", "text"].find(name => typeof first[name] === "string") });
      }
    } else found.push(...candidates(child, path, depth + 1));
  }
  return found;
}
function arrayCollections(value: unknown, prefix = "", depth = 0): { path: string; items: unknown[] }[] {
  if (!object(value) || depth >= LIMITS.depth) return [];
  const result: { path: string; items: unknown[] }[] = [];
  for (const [key, child] of Object.entries(value).slice(0, LIMITS.properties)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(child)) result.push({ path, items: child });
    else result.push(...arrayCollections(child, path, depth + 1));
  }
  return result;
}
function mappingFor(candidate: Candidate): ObservedMapping[] {
  const base = candidate.path === "results" && candidate.urlKey === "url" ? "identity" : candidate.path.includes(".") ? "nested_path" : "rename";
  const mappings: ObservedMapping[] = [{ canonicalPath: "results[].url", observedPath: `${candidate.path}[].${candidate.urlKey}`, transformation: base === "identity" ? "identity" : "array_item_mapping", evidence: ["observed URL-bearing array item"] }];
  if (candidate.titleKey) mappings.push({ canonicalPath: "results[].title", observedPath: `${candidate.path}[].${candidate.titleKey}`, transformation: "array_item_mapping", evidence: ["observed optional title-like item field"] });
  if (candidate.snippetKey) mappings.push({ canonicalPath: "results[].snippet", observedPath: `${candidate.path}[].${candidate.snippetKey}`, transformation: "array_item_mapping", evidence: ["observed optional snippet-like item field"] });
  return mappings;
}
function validHttpUrl(value: unknown) { if (typeof value !== "string") return false; try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:"; } catch { return false; } }

export function observeSimulatedWebSearch(fixture: SimulatedExecutionFixture): ObservedCapabilityEvidence {
  const base = { capabilityId: "web.search" as const, providerId: fixture.providerId, resourceId: fixture.resourceId, observedAt: fixture.observedAt, executionMode: "simulated" as const, requestEvidence: { canonicalInput: fixture.canonicalInput, nativeInputShape: fixture.nativeInput, accepted: fixture.reportedSuccess !== false && fixture.httpStatus >= 200 && fixture.httpStatus < 300 }, responseEvidence: { httpStatus: fixture.httpStatus, contentType: fixture.contentType } };
  const failed = (outcome: ObservedOutcome, diagnostics: string[], extraction: CanonicalExtractionStatus = "failed", validation: CanonicalValidationStatus = "unknown"): ObservedCapabilityEvidence => ({ ...base, responseEvidence: { ...base.responseEvidence, responseShape: typeof fixture.body === "string" ? undefined : describeObservedShape(fixture.body) }, canonicalExtraction: { status: extraction, mappings: [], missingRequiredFields: extraction === "failed" ? ["results[].url"] : [], diagnostics: diagnostics.slice(0, LIMITS.diagnostics).map(clean) }, canonicalValidation: { status: validation, diagnostics: diagnostics.slice(0, LIMITS.diagnostics).map(clean) }, outcome });
  if (fixture.reportedSuccess === false || fixture.httpStatus < 200 || fixture.httpStatus >= 300) return failed("execution_failed", [`execution reported failure (HTTP ${fixture.httpStatus})`]);
  if (!/application\/json/i.test(fixture.contentType)) return failed("malformed_response", ["successful web.search response was not JSON"]);
  let body = fixture.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { return failed("malformed_response", ["response body is malformed JSON"]); } }
  if (!object(body)) return failed("incompatible_response", ["JSON response is not an object"]);
  const allCandidates = candidates(body);
  const collections = arrayCollections(body);
  const emptyCollections = collections.filter(collection => collection.items.length === 0).map(collection => collection.path);
  if (!allCandidates.length) {
    if (emptyCollections.length) return { ...failed("structurally_informative", [`empty array container observed at ${emptyCollections[0]}; no item URL shape was observed`], "partial"), responseEvidence: { ...base.responseEvidence, responseShape: describeObservedShape(body) }, canonicalExtraction: { status: "partial", mappings: [], missingRequiredFields: ["results[].url item shape"], diagnostics: [`empty array container observed at ${emptyCollections[0]}; no item URL shape was observed`] } };
    const urlLess = collections.find(collection => collection.items.some(object));
    if (urlLess) return { ...failed("incompatible_response", [`observed collection ${urlLess.path} has no URL-bearing item field`], "partial", "invalid"), responseEvidence: { ...base.responseEvidence, responseShape: describeObservedShape(body) }, canonicalExtraction: { status: "partial", mappings: [], missingRequiredFields: ["results[].url"], diagnostics: [`observed collection ${urlLess.path} has no URL-bearing item field`] }, canonicalValidation: { status: "invalid", diagnostics: ["canonical result items require HTTP(S) URLs"] } };
    return failed("incompatible_response", ["no observed URL-bearing result collection"]);
  }
  if (allCandidates.length > 1) return failed("incompatible_response", ["ambiguous observed URL-bearing result collections"], "ambiguous");
  const candidate = allCandidates[0]; const mappings = mappingFor(candidate);
  const invalid = candidate.items.map((item, index) => ({ item, index })).filter(({ item }) => !object(item) || !validHttpUrl((item as Record<string, unknown>)[candidate.urlKey]));
  if (invalid.length) return { ...failed("incompatible_response", [`${invalid.length} result item(s) lack a valid HTTP(S) URL`], "partial", "invalid"), responseEvidence: { ...base.responseEvidence, responseShape: describeObservedShape(body) }, canonicalExtraction: { status: "partial", mappings, missingRequiredFields: ["results[].url"], diagnostics: [`${invalid.length} result item(s) lack a valid HTTP(S) URL`] }, canonicalValidation: { status: "invalid", diagnostics: ["canonical URLs must use http or https"] } };
  if (fixture.semanticStatus === "rejected") return { ...failed("incompatible_response", ["semantic scope is not general public-web search"], "success", "valid"), responseEvidence: { ...base.responseEvidence, responseShape: describeObservedShape(body) }, canonicalExtraction: { status: "success", mappings, missingRequiredFields: [], diagnostics: ["structural mapping exists only for this observation"] }, canonicalValidation: { status: "valid", diagnostics: ["structural canonical output validates"] } };
  return { ...base, responseEvidence: { ...base.responseEvidence, responseShape: describeObservedShape(body) }, canonicalExtraction: { status: "success", mappings, missingRequiredFields: [], diagnostics: ["mapping is observed evidence, not an advertised schema or AdapterPlan"] }, canonicalValidation: { status: "valid", diagnostics: [] }, outcome: "canonical_success" };
}
