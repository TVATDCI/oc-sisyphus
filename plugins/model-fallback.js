/**
 * plugins/model-fallback.js — V2 auto-discovery shim for the model-fallback
 * plugin (the sisyphus-gates.js plain-file pattern: 2.1.x auto-discovers
 * plain files under plugins/, config-declared local-dir plugins are not
 * loaded that way). The definition lives in model-fallback/src/index.js.
 */
export { modelFallbackDefinition as default } from "./model-fallback/src/index.js";
