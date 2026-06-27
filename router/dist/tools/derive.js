// Compatibility facade for the original derive module.
// The implementation lives in transform.ts so freeflow_derive, future
// freeflow_search transform, and freeflow_run.scriptFilter share one engine.
export { freeflowDerive, validateDeriveInput } from "../transform/engine.js";
