import RAPIER from "@dimforge/rapier3d-compat";

// The compat build loads its WebAssembly asynchronously. Keeping that boundary in one module
// guarantees every Rapier consumer sees a ready runtime while preserving the scene classes'
// synchronous constructors.
await RAPIER.init();

export default RAPIER;
