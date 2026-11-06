// Shim: the real runtime/src/mcpConfig.ts pulls in the whole runtime; the vendored manifest parser only needs this one pattern.
export const VAULT_NAME = /^[A-Z][A-Z0-9_]{0,63}$/;
