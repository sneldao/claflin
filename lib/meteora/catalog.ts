/**
 * Halley's quote-mint catalog — the assets a launched token can be priced in.
 * A sourced allowlist like Jesse's: every entry was verified against mainnet
 * RPC on 2026-10-02 (badge PDAs confirmed to exist for the xStocks).
 *
 * Why badges matter: Meteora's Token-2022 rules make a quote mint
 * permissionless only when it carries metadata-only extensions and a zero
 * transfer fee. Real xStocks carry permanentDelegate, transferHook,
 * pausableConfig and more, so they need a Meteora operator-created
 * `TokenBadge` account — "the path used for Stock Tokens" per Meteora's own
 * docs. The badge PDA for each entry below was confirmed to exist on mainnet;
 * `badge` is null for mints that are permissionless (USDC) or carry only
 * metadata extensions.
 *
 * The desk launches a NEW base mint (a tracker/exposure token — never a claim
 * of stock ownership) quoted in one of these assets. The base mint is created
 * by the DBC program at launch time; nothing here is the base.
 */

export interface HalleyQuoteMint {
  /** Display symbol, e.g. 'USDC' or 'AAPLx'. */
  symbol: string;
  /** Mainnet mint address. */
  mint: string;
  decimals: number;
  tokenProgram: 'spl-token' | 'spl-token-2022';
  /** Meteora token-badge PDA, verified present on mainnet; null when the mint
   *  is permissionless (SPL or metadata-only Token-2022). */
  badge: string | null;
  /** Underlying equity symbol for xStock quotes — the pair anchor target. */
  underlyingSymbol: string | null;
}

export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export const HALLEY_QUOTE_MINTS: readonly HalleyQuoteMint[] = Object.freeze([
  Object.freeze({
    symbol: 'USDC',
    mint: USDC_MINT,
    decimals: 6,
    tokenProgram: 'spl-token',
    badge: null,
    underlyingSymbol: null,
  }),
  Object.freeze({
    symbol: 'AAPLx',
    mint: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp',
    decimals: 8,
    tokenProgram: 'spl-token-2022',
    badge: '8VeVZe3Zxfpax2qQUp7i68FCLspLYErm2FJChc5NDuVn',
    underlyingSymbol: 'AAPL',
  }),
  Object.freeze({
    symbol: 'NVDAx',
    mint: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh',
    decimals: 8,
    tokenProgram: 'spl-token-2022',
    badge: 'mfacWnGh1Kn5ttHMMaNZhRZbCjvGrDQyDyZgqaR9vBM',
    underlyingSymbol: 'NVDA',
  }),
  Object.freeze({
    symbol: 'TSLAx',
    mint: 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB',
    decimals: 8,
    tokenProgram: 'spl-token-2022',
    badge: 'XhM8atXDua58KZnZFLu5vJjzaNWjXaEvpPPEVnHn1ax',
    underlyingSymbol: 'TSLA',
  }),
]);

export function quoteMintForSymbol(symbol: string): HalleyQuoteMint | null {
  const wanted = symbol.trim().toUpperCase();
  return HALLEY_QUOTE_MINTS.find(q => q.symbol.toUpperCase() === wanted) ?? null;
}

/* ---- Program + network constants ------------------------------------ */

export const DBC_PROGRAM_ID = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN';
export const DAMM_V2_PROGRAM_ID = 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG';
/** PDA that must equal the DAMM v2 config's poolCreatorAuthority for
 *  migration to accept it — program-side validation, proven on devnet. */
export const DBC_POOL_AUTHORITY = 'FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM';

/**
 * DAMM v2 migration configs. Not the generic index-0 configs — migration
 * requires a config whose poolCreatorAuthority is the DBC pool authority.
 * Devnet indices 20000–20006 satisfy this; on mainnet the same canonical
 * config address exists and was verified live 2026-10-10 (enumerated via
 * CpAmm.getAllConfigs on mainnet RPC: poolCreatorAuthority ==
 * FhVo3mqL…uM, full-range sqrt prices, default vault, Timestamp
 * activation — all program requirements). HALLEY_DAMM_CONFIG overrides.
 */
export const DAMM_V2_MIGRATION_CONFIGS = Object.freeze({
  devnet: '7F6dnUcRuyM2TwR8myT1dYypFXpPSxqwKNSFNkxyNESd',
  mainnet: process.env.HALLEY_DAMM_CONFIG ?? '7F6dnUcRuyM2TwR8myT1dYypFXpPSxqwKNSFNkxyNESd',
});
