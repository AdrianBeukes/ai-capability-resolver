import { loadProductionConfig } from "./production-config.js";
try { const c=loadProductionConfig(); console.log(JSON.stringify({valid:true,mode:c.mode,paymentEnabled:c.payment.enabled})); } catch(error) { console.error(error instanceof Error?error.message:"Invalid configuration"); process.exitCode=1; }
