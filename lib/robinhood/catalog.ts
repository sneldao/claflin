/**
 * Isabel's Robinhood Chain instrument catalog — a sourced allowlist, never a
 * dynamic arbitrary-token catalog. Every entry was verified 2026-10-01
 * against three independent authorities:
 *
 *   1. Issuer catalog — `GET https://api.robinhood.com/rhj/assets` (194
 *      assets; each entry here was ASSET_STATUS_ACTIVE with a chainId-4663
 *      deployment at verification time).
 *   2. Onchain mark — Chainlink directory `feeds-robinhood-mainnet.json`
 *      (`Robinhood <SYM> / USD` feed, 8 decimals, 86400s heartbeat); each
 *      proxyAddress is the feed to read, never a hardcoded guess.
 *   3. Venue — `GET https://api.rh.lighter.xyz/api/v1/orderBooks` (the
 *      Robinhood Chain Lighter domain); each entry had an active
 *      `<SYM>/USDG` spot market at verification time.
 *
 * The catalog is the triple-covered set: issuer catalog ∩ Chainlink feed ∩
 * Lighter spot book — 24 symbols at verification. BE trades on Lighter but
 * has no feed; twelve fed names (ASML, CLSK, DELL, EWY, GLD, GME, IONQ, MSTR,
 * NBIS, RGTI, RKLB, TSM) have no spot book. Neither joins the desk until all
 * three legs exist — an offering must be able to show issuer reference,
 * onchain mark, and venue quote without substitution.
 *
 * Coverage facts that belong in every read of this file:
 *   - Stock tokens are ERC-20, 18 decimals, issued by Robinhood Assets
 *     (Jersey) Limited — debt securities with US-person restrictions. The
 *     tokens are transferable; eligibility is our product's policy surface
 *     (docs/ELIGIBILITY.md), never the chain's.
 *   - The ERC-8056 multiplier is live state (`uiMultiplier()`, e.g. CRM was
 *     already at 1.001148 on verification day). It is NEVER stored here —
 *     read it at quote time.
 *   - rhj `/prices` returns underlying bid/ask plus `tokenBid`/`tokenAsk`
 *     (multiplier-adjusted server-side); the Chainlink feed is already
 *     multiplier-adjusted. Label each for what it is.
 *
 * Solana mints keep case; Robinhood ids lowercase — EVM address ids have no
 * case information to preserve.
 */

import { TradingError } from '../trading/domain';
import {
  isRobinhoodInstrumentId,
  type RobinhoodInstrument,
  type RobinhoodInstrumentId,
} from './contracts';

export const ROBINHOOD_ISSUER = 'Robinhood Assets (Jersey) Limited';
export const RHJ_ASSETS_URL = 'https://api.robinhood.com/rhj/assets';
const VERIFIED_AT = 1790885700000; // 2026-10-01 ~20:15 UTC, the live triple-check.

function entry(
  symbol: string,
  name: string,
  contractAddress: string,
  chainlinkFeed: string,
  lighterMarketId: number,
): RobinhoodInstrument {
  return Object.freeze({
    id: `rh:${contractAddress.toLowerCase()}` as RobinhoodInstrumentId,
    network: 'eip155:4663' as const,
    deskId: 'isabel' as const,
    contractAddress,
    symbol,
    name,
    underlyingSymbol: symbol,
    decimals: 18 as const,
    issuer: ROBINHOOD_ISSUER,
    chainlinkFeed,
    lighterMarketId,
    identitySourceUrl: RHJ_ASSETS_URL,
    verifiedAt: VERIFIED_AT,
    quoteSupported: true,
  });
}

export const ROBINHOOD_INSTRUMENTS: readonly RobinhoodInstrument[] = Object.freeze([
  entry('AAPL', 'Apple • Robinhood Token', '0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9', '0x6B22A786bAa607d76728168703a39Ea9C99f2cD0', 2049),
  entry('AMD', 'AMD • Robinhood Token', '0x86923f96303D656E4aa86D9d42D1e57ad2023fdC', '0x943A29E7ae51A4798823ca9eEd2ed533B2A22C72', 2068),
  entry('AMZN', 'Amazon • Robinhood Token', '0x12f190a9F9d7D37a250758b26824B97CE941bF54', '0xD5a1508ceD74c084eBf3cBe853e2C968fB2a651C', 2050),
  entry('BABA', 'Alibaba • Robinhood Token', '0xad25Ac6C84D497db898fa1E8387bf6Af3532a1c4', '0x62Cc8F9b5f56a33c9C8A60c8B92779f523c4E984', 2058),
  entry('COIN', 'Coinbase • Robinhood Token', '0x6330D8C3178a418788dF01a47479c0ce7CCF450b', '0xA3a468A452940B7D6b69991207B508c609a98Ef2', 2062),
  entry('CRCL', 'Circle Internet Group • Robinhood Token', '0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5', '0x6652eDf64bA3731C4F2D3ce821A0Fb1f1f6b482a', 2063),
  entry('CRWV', 'CoreWeave • Robinhood Token', '0x5f10A1C971B69e47e059e1dC91901B59b3fB49C3', '0xe1b3aABCAFAd1c94708dc1367dcfF8Aa4407487C', 2072),
  entry('GOOGL', 'Alphabet Class A • Robinhood Token', '0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3', '0xF6f373a037c30F0e5010d854385cA89185AE638b', 2051),
  entry('INTC', 'Intel • Robinhood Token', '0xc72b96e0E48ecd4DC75E1e45396e26300BC39681', '0x3f390C5C24628Ac7C489515402235FeAD71D1913', 2069),
  entry('META', 'Meta Platforms • Robinhood Token', '0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35', '0x7C38C00C30BEe9378381E7B6135d7283356D71b1', 2052),
  entry('MSFT', 'Microsoft • Robinhood Token', '0xe93237C50D904957Cf27E7B1133b510C669c2e74', '0x45C3C877C15E6BA2EBB19eA114Ea508d14C1Af2E', 2053),
  entry('MU', 'Micron Technology • Robinhood Token', '0xfF080c8ce2E5feadaCa0Da81314Ae59D232d4afD', '0x425EEFdCf05ed6526C3cE61Af99429A228a6d596', 2070),
  entry('NVDA', 'NVIDIA • Robinhood Token', '0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC', '0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15', 2054),
  entry('ORCL', 'Oracle • Robinhood Token', '0xb0992820E760d836549ba69BC7598b4af75dEE03', '0x0e6a64a2B58A6693a531E6c555f3A5d042eEA844', 2056),
  entry('PLTR', 'Palantir Technologies • Robinhood Token', '0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A', '0x820ABedFF239034956B7A9d2F0a331f9F075eB4c', 2073),
  entry('QQQ', 'Invesco QQQ • Robinhood Token', '0xD5f3879160bc7c32ebb4dC785F8a4F505888de68', '0x80901d846d5D7B030F26B480776EE3b29374C2ae', 2064),
  entry('SGOV', 'iShares 0-3 Month Treasury Bond • Robinhood Token', '0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5', '0xa0DF4ee0fFf975306345875E3548Fcc519577A11', 2066),
  entry('SLV', 'iShares Silver Trust • Robinhood Token', '0x411eFb0E7f985935DAec3D4C3ebaEa0d0AD7D89f', '0x209b73908e92Ae021826eD79609845451Ecba2ce', 2067),
  entry('SNDK', 'Sandisk Corporation • Robinhood Token', '0xB90A19fF0Af67f7779afF50A882A9CfF42446400', '0xfb133Fa4B7b385802B693a293606682Df47109A3', 2071),
  entry('SPCX', 'Space Exploration Technologies Corp. Class A Common Stock • Robinhood Token', '0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa', '0xB265810950ba6c5C0Ff821c9963014a56fD8Bffb', 2057),
  entry('SPY', 'SPDR S&P 500 ETF Trust • Robinhood Token', '0x117cc2133c37B721F49dE2A7a74833232B3B4C0C', '0x319724394D3A0e3669269846abE664Cd621f9f6A', 2065),
  entry('TSLA', 'Tesla • Robinhood Token', '0x322F0929c4625eD5bAd873c95208D54E1c003b2d', '0x4A1166a659A55625345e9515b32adECea5547C38', 2055),
  entry('USAR', 'USA Rare Earth • Robinhood Token', '0xd917B029C761D264c6A312BBbcDA868658eF86a6', '0xA994d3684e8400A6c8078226925779FdeE682DD9', 2060),
  entry('USO', 'United States Oil Fund • Robinhood Token', '0xa30FA36Db767ad9eD3f7a60fC79526fB4d56D344', '0x75a9c76Ef439e2C7c2E5a34Ab105EcFe3766431c', 2061),
]);

/** Every instrument Isabel's desk may quote — today, the triple-covered 24. */
export function instrumentsForRobinhoodDesk(): readonly RobinhoodInstrument[] {
  return ROBINHOOD_INSTRUMENTS;
}

/**
 * Exact-id lookup in Isabel's allowlist — `rh:` + lowercase contract, no
 * aliasing. A symbol-shaped or checksummed-but-uncatalogued id is unknown,
 * 404.
 */
export function getRobinhoodInstrument(id: string): RobinhoodInstrument {
  const canonical = id.toLowerCase();
  if (!isRobinhoodInstrumentId(canonical)) {
    throw new TradingError('unknown_instrument', 'This product is outside Isabel’s Robinhood Chain catalog.', 404);
  }
  const instrument = ROBINHOOD_INSTRUMENTS.find(candidate => candidate.id === canonical);
  if (!instrument) throw new TradingError('unknown_instrument', 'This product is outside Isabel’s Robinhood Chain catalog.', 404);
  return instrument;
}
