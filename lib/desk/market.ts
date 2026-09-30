/**
 * Market profiles — which geography the live desk serves. The choice is
 * config, not code: eligibility copy, funding rails, and wallet entry all
 * read from the active profile so a market change is an env var, never a
 * redesign.
 *
 * Set NEXT_PUBLIC_CLAFLIN_MARKET=ph|ng. Default 'ph': the Philippines is the
 * launch profile — English-viable UI, mobile-first payments (GCash/Maya),
 * and the deepest ramp coverage of the finalists (MoonPay + Transak).
 * Nigeria ('ng') stays configured: MoonPay does not serve it, so its funding
 * rail is Transak's African coverage plus the manual path.
 */

export type MarketId = 'ph' | 'ng';

export interface RampProvider {
  name: string;
  /** Deep link into the provider's buy flow, pre-filled for the wallet. */
  urlFor(asset: 'USDC' | 'SOL', wallet: string): string;
}

export interface WalletEntry {
  name: string;
  /** Universal link that opens this app inside the wallet's own browser. */
  url(currentUrl: string): string;
}

export interface MarketProfile {
  id: MarketId;
  country: string;
  fiatCurrency: string;
  /** Ramps that sell USDC-SPL / SOL into a self-custody wallet, in order. */
  ramps: RampProvider[];
  /** Wallet apps that can host the desk on mobile. */
  wallets: WalletEntry[];
  /** SOL held for network fees — shown as a hint, not a requirement. */
  solFeeHint: string;
  /** Issuer product terms the attestation links to. */
  issuerTermsUrl: string;
}

function transak(fiat: string): RampProvider {
  return {
    name: 'Transak',
    urlFor(asset, wallet) {
      const params = new URLSearchParams({
        cryptoCurrencyCode: asset,
        network: 'solana',
        walletAddress: wallet,
        fiatCurrency: fiat,
        disableWalletAddressForm: 'true',
      });
      return `https://global.transak.com/?${params.toString()}`;
    },
  };
}

const MOONPAY_ASSETS: Record<'USDC' | 'SOL', string> = { USDC: 'usdc_sol', SOL: 'sol' };

function moonpay(fiat: string): RampProvider {
  return {
    name: 'MoonPay',
    urlFor(asset, wallet) {
      const params = new URLSearchParams({
        currencyCode: MOONPAY_ASSETS[asset],
        walletAddress: wallet,
        baseCurrencyCode: fiat,
      });
      return `https://buy.moonpay.com/?${params.toString()}`;
    },
  };
}

const PHANTOM: WalletEntry = {
  name: 'Phantom',
  url(currentUrl) {
    return `https://phantom.app/ul/browse/${encodeURIComponent(currentUrl)}`;
  },
};

const SOLFLARE: WalletEntry = {
  name: 'Solflare',
  url(currentUrl) {
    return `https://solflare.com/ul/v1/browse/${encodeURIComponent(currentUrl)}`;
  },
};

const ISSUER_TERMS = 'https://assets.backed.fi/legal-documentation';

export const MARKET_PROFILES: Record<MarketId, MarketProfile> = {
  ph: {
    id: 'ph',
    country: 'the Philippines',
    fiatCurrency: 'PHP',
    ramps: [moonpay('PHP'), transak('PHP')],
    wallets: [PHANTOM, SOLFLARE],
    solFeeHint: '0.01 SOL',
    issuerTermsUrl: ISSUER_TERMS,
  },
  ng: {
    id: 'ng',
    country: 'Nigeria',
    fiatCurrency: 'NGN',
    /* MoonPay lists Nigeria as prohibited — Transak's African coverage is the rail. */
    ramps: [transak('NGN')],
    wallets: [PHANTOM, SOLFLARE],
    solFeeHint: '0.01 SOL',
    issuerTermsUrl: ISSUER_TERMS,
  },
};

export function marketProfile(id: string | null | undefined): MarketProfile {
  return id === 'ng' ? MARKET_PROFILES.ng : MARKET_PROFILES.ph;
}

/** The market this deployment serves — read once at build time. */
export const CLAFLIN_MARKET: MarketProfile = marketProfile(process.env.NEXT_PUBLIC_CLAFLIN_MARKET);
