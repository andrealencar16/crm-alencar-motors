import { createRevendaMaisAdapter } from "./revendamais-adapter.ts";

/** Server entrypoint for a future integration. No payload-controlled config. */
export function createRevendaMaisAdapterFromEnv(
  readEnv: (name: "REVENDAMAIS_DEALER_ID") => string | undefined,
) {
  const dealerId = readEnv("REVENDAMAIS_DEALER_ID");
  // Missing/malformed configuration must never fall back to the incoming dealer.
  if (!dealerId || !/^[1-9][0-9]{0,39}$/.test(dealerId)) {
    throw new Error("invalid_revendamais_configuration");
  }
  return createRevendaMaisAdapter({ authorizedDealerId: dealerId });
}
