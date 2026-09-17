/** Metadata-only, protocol-neutral planning for the canonical web.search contract. */
export type SchemaCompatibilityStatus = "compatible" | "partially_compatible" | "incompatible" | "unknown";
export type MappingDirection = "input" | "output";
export type SafeTransformation = "identity" | "rename" | "nested_path" | "array_item_mapping" | "optional_default";
export interface FieldMapping { canonicalPath: string; nativePath: string; direction: MappingDirection; confidence: "strong" | "moderate"; evidence: readonly string[]; transformation: SafeTransformation; }
export interface AdapterPlan { capabilityId: "web.search"; resourceId: string; input: { mappings: readonly FieldMapping[]; defaults: readonly string[]; transformations: readonly SafeTransformation[] }; output: { mappings: readonly FieldMapping[]; transformations: readonly SafeTransformation[] }; unsupportedCanonicalFields: readonly string[]; unusedNativeFields: readonly string[]; }
export interface SchemaCompatibilityResult { status: SchemaCompatibilityStatus; inputMappings: readonly FieldMapping[]; outputMappings: readonly FieldMapping[]; transformations: readonly SafeTransformation[]; evidence: readonly string[]; missingRequirements: readonly string[]; incompatibilities: readonly string[]; adapterPlan?: AdapterPlan; }

type Node = Record<string, unknown>;
const object = (x: unknown): x is Node => !!x && typeof x === "object" && !Array.isArray(x);
const tokens = (s: string) => s.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const pathJoin = (a: string, b: string) => a ? `${a}.${b}` : b;
function resolver(root: Node) {
  let external = false;
  const deref = (n: unknown): Node | undefined => { if (!object(n)) return undefined; if (typeof n.$ref !== "string") return n; const r=n.$ref; if (!/^#\/(?:\$defs|definitions)\//.test(r)) { external=true; return undefined; } const key=r.split("/").slice(2).join("/"); const bucket=r.startsWith("#/$defs/") ? root.$defs : root.definitions; return object(bucket) && object(bucket[key]) ? bucket[key] : undefined; };
  return { deref, hasExternal: () => external };
}
function typeIs(n: Node | undefined, want: "string" | "number") { const t=n?.type; return t === want || (Array.isArray(t) && t.includes(want)); }
function alternatives(n: Node | undefined, get: (v: unknown) => Node | undefined): Node[] { if (!n) return []; for (const k of ["oneOf","anyOf","allOf"] as const) if (Array.isArray(n[k])) return (n[k] as unknown[]).map(get).filter((x): x is Node => !!x); return [n]; }
function properties(n: Node | undefined, get: (v: unknown) => Node | undefined) { const p=n && object(n.properties) ? n.properties : {}; return Object.entries(p).map(([name, value]) => [name, get(value)] as const).filter((x): x is [string,Node] => !!x[1]); }
function desc(n: Node) { return [n.title,n.description].filter((x): x is string => typeof x === "string").join(" ").toLowerCase(); }
function transform(canonical: string, native: string, array=false): SafeTransformation { return array ? "array_item_mapping" : canonical === native ? "identity" : native.includes(".") ? "nested_path" : "rename"; }
function mapping(canonicalPath:string,nativePath:string,direction:MappingDirection,evidence:string[],confidence:"strong"|"moderate"="strong",array=false): FieldMapping { return {canonicalPath,nativePath,direction,confidence,evidence,transformation:transform(canonicalPath,nativePath,array)}; }
function queryCandidate(name:string,n:Node) { if(!typeIs(n,"string")) return 0; const t=tokens(name), d=desc(n); if(name.toLowerCase()==="q" || t.includes("query") || (t.includes("search") && (t.includes("query") || d.includes("query")))) return 3; if((t.includes("text") || t.includes("search")) && /search query|query to search/.test(d)) return 2; return 0; }
function limitCandidate(name:string,n:Node) { const t=tokens(name); return typeIs(n,"number") && (t.includes("limit")||t.includes("count")||(t.includes("num")&&t.includes("results"))||(t.includes("max")&&t.includes("results"))) }
function credential(name:string,n:Node) { return /api.?key|token|secret|credential|authorization|account.?id/i.test(`${name} ${desc(n)}`); }
function findResults(n:Node|undefined,get:(v:unknown)=>Node|undefined,prefix="",seen=new Set<Node>()): { path:string; item:Node; evidence:string[] }[] {
  if(!n||seen.has(n))return []; seen.add(n); const out: {path:string;item:Node;evidence:string[]}[]=[];
  for(const [name, child] of properties(n,get)) { const path=pathJoin(prefix,name); const ts=tokens(name); const item=get(child.items); if(item && (ts.includes("results")||ts.includes("items")||ts.includes("organic")||ts.includes("matches"))) out.push({path,item,evidence:[`collection field '${name}' has array items`]}); else if(!item && (child.type === "object" || object(child.properties) || child.$ref)) out.push(...findResults(child,get,path,seen)); }
  return out;
}
function urlField(item:Node,get:(v:unknown)=>Node|undefined) { return properties(item,get).filter(([name,n]) => typeIs(n,"string") && ["url","link","href"].includes(name.toLowerCase())); }
function optional(item:Node,get:(v:unknown)=>Node|undefined,names:string[]) { return properties(item,get).find(([name,n])=>typeIs(n,"string")&&names.includes(name.toLowerCase())); }

export function analyzeWebSearchSchema(resourceId: string, inputSchema: unknown, outputSchema: unknown): SchemaCompatibilityResult {
  const inputRoot=object(inputSchema)?inputSchema:undefined, outputRoot=object(outputSchema)?outputSchema:undefined;
  const inMaps: FieldMapping[]=[]; const outMaps: FieldMapping[]=[]; const evidence:string[]=[]; const missing:string[]=[]; const bad:string[]=[];
  if(!inputRoot) missing.push("input schema is absent or not an object");
  else { const r=resolver(inputRoot), root=r.deref(inputRoot); const variants=alternatives(root,r.deref); const candidates=variants.flatMap(v=>properties(v,r.deref).map(([name,n])=>({name,n,score:queryCandidate(name,n)})).filter(x=>x.score)); const best=Math.max(0,...candidates.map(x=>x.score)); const chosen=candidates.filter(x=>x.score===best);
    if(chosen.length===1) { const c=chosen[0]; inMaps.push(mapping("query",c.name,"input",[`textual field '${c.name}'`,"JSON Schema string type",...(desc(c.n).includes("query")?["description identifies query"]:[])],c.score===3?"strong":"moderate")); evidence.push("native textual search input is deterministically mappable"); }
    else if(chosen.length>1) missing.push("ambiguous_input_mapping"); else missing.push(r.hasExternal() ? "input schema contains an external $ref (not fetched)" : "canonical required query has no clear native textual search field");
    const chosenName=chosen[0]?.name; for(const v of variants) { const required=Array.isArray(v.required)?v.required.filter((x):x is string=>typeof x==="string"):[]; for(const name of required) { const n=properties(v,r.deref).find(([k])=>k===name)?.[1]; if(name!==chosenName && n && !limitCandidate(name,n)) bad.push(credential(name,n)?`required credential/authentication input '${name}' cannot be derived`:`required native input '${name}' cannot be derived from canonical input`); } }
    const lim=properties(root,r.deref).find(([name,n])=>limitCandidate(name,n)); if(lim) inMaps.push(mapping("limit",lim[0],"input",[`numeric result-limit field '${lim[0]}'`,`JSON Schema number type`],"strong"));
    if(r.hasExternal()) missing.push("input schema contains an external $ref (not fetched)"); }
  if(!outputRoot) missing.push("output schema is absent or not an object");
  else { const r=resolver(outputRoot), root=r.deref(outputRoot); const results=alternatives(root,r.deref).flatMap(v=>findResults(v,r.deref)); const candidates=results.flatMap(x=>urlField(x.item,r.deref).map(([name,n])=>({collection:x,name,n}))); if(candidates.length===1) { const c=candidates[0], base=`${c.collection.path}[].${c.name}`; outMaps.push(mapping("results[].url",base,"output",[...c.collection.evidence,`URL-bearing field '${c.name}'`,`JSON Schema string type`],"strong",true)); const title=optional(c.collection.item,r.deref,["title","name"]); if(title)outMaps.push(mapping("results[].title",`${c.collection.path}[].${title[0]}`,"output",[`optional title field '${title[0]}'`],"moderate",true)); const snippet=optional(c.collection.item,r.deref,["snippet","description","text"]); if(snippet)outMaps.push(mapping("results[].snippet",`${c.collection.path}[].${snippet[0]}`,"output",[`optional snippet field '${snippet[0]}'`],"moderate",true)); evidence.push("native output has a deterministic URL-bearing result collection"); } else if(candidates.length>1) missing.push("ambiguous_output_mapping"); else if(r.hasExternal()) missing.push("output schema contains an external $ref (not fetched)"); else bad.push("output does not expose a URL-bearing result collection"); if(r.hasExternal() && !missing.includes("output schema contains an external $ref (not fetched)")) missing.push("output schema contains an external $ref (not fetched)"); }
  const inputOK=inMaps.some(x=>x.canonicalPath==="query"), outputOK=outMaps.some(x=>x.canonicalPath==="results[].url");
  let status: SchemaCompatibilityStatus = bad.length ? "incompatible" : inputOK && outputOK ? "compatible" : inputOK || missing.length ? "partially_compatible" : "unknown";
  const transformations=[...new Set([...inMaps,...outMaps].map(x=>x.transformation))]; const unsupported=inMaps.some(x=>x.canonicalPath==="limit")?[]:["limit"];
  const plan=status==="compatible" ? {capabilityId:"web.search" as const,resourceId,input:{mappings:inMaps,defaults:[],transformations:inMaps.map(x=>x.transformation)},output:{mappings:outMaps,transformations:outMaps.map(x=>x.transformation)},unsupportedCanonicalFields:unsupported,unusedNativeFields:[]} : undefined;
  return {status,inputMappings:inMaps,outputMappings:outMaps,transformations,evidence,missingRequirements:missing,incompatibilities:bad,...(plan?{adapterPlan:plan}:{})};
}
