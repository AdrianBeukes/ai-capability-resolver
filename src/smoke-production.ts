const base=process.argv[2]??process.env.PUBLIC_BASE_URL;if(!base)throw new Error("Usage: npm run smoke:production -- https://gateway.example");
const target=new URL(base);if(target.protocol!=="https:")throw new Error("Target must be HTTPS");
for(const p of ["/health","/v1/capabilities"]){const r=await fetch(new URL(p,target));if(!r.ok)throw new Error(`${p} failed: ${r.status}`);}
const unpaid=await fetch(new URL("/v1/execute",target),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({capability:"web.search",input:{query:"smoke"}})});if(unpaid.status!==402)throw new Error(`Expected unpaid 402, got ${unpaid.status}`);console.log("Production unpaid smoke check passed; no payment was sent.");
