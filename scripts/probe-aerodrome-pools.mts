/**
 * Aerodrome pool probe — read-only unlock report for the blocked Base names.
 *
 *   pnpm exec tsx scripts/probe-aerodrome-pools.mts [--symbol=AMZNc] [--json]
 *   BASE_RPC_URL=https://… pnpm exec tsx scripts/probe-aerodrome-pools.mts
 *
 * For every catalog instrument that is not yet quotable, it:
 *   1. reads decimals() on-chain (the null the catalog needs filled),
 *   2. asks the newest Slipstream CL factory for a USDC pool at each
 *      standard tickSpacing,
 *   3. reads the pool's in-range liquidity and confirms the desk's own
 *      MixedRouteQuoterV3 actually resolves it with a 1-USDC exact-input
 *      probe — the same call the live quote path makes,
 *   4. prints the exact VenuePair fields you would paste into
 *      lib/tokenized-stocks.ts, and whether decimals + a USDC pool now
 *      clear the gate in lib/trading/catalog.ts.
 *
 * It makes only `eth_call`s. It never signs, sends, or writes anything —
 * on-chain or in the repo. Nothing here promotes an instrument; a human
 * still edits the catalog and re-reads the issuer's docs.
 */
import { ethers } from 'ethers';
import { TOKENIZED_STOCKS, AERODROME_VENUE, type TokenizedStock } from '../lib/tokenized-stocks.ts';
import {
  BASE_CHAIN_ID, BASE_RPC_URL, BASE_USDC, BASE_USDC_DECIMALS,
  AERODROME_CL_FACTORY_NEWEST, AERODROME_CL_FACTORY2_BITMASK, AERODROME_MIXED_QUOTER,
} from '../lib/base-chain.ts';
import { classifyUnlock, routablePools, type PoolReading } from '../lib/trading/pool-unlock.ts';

const args = new Map(process.argv.slice(2).map(a => {
  const [k, v = 'true'] = a.replace(/^--/, '').split('=');
  return [k, v] as const;
}));
const onlySymbol = args.get('symbol')?.toLowerCase();
const asJson = args.has('json');

/* tickSpacings the newest Slipstream CL factory deploys. The four verified
   stock pools all sit at 10; the rest are probed so a thinner name that
   only has a wider-spacing pool is still found. */
const TICK_SPACINGS = [1, 10, 50, 100, 200, 2000] as const;

const FACTORY_ABI = ['function getPool(address tokenA, address tokenB, int24 tickSpacing) view returns (address)'];
const POOL_ABI = [
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function tickSpacing() view returns (int24)',
  'function liquidity() view returns (uint128)',
];
const ERC20_ABI = ['function decimals() view returns (uint8)'];
const QUOTER_ABI = ['function quoteExactInput(bytes path, uint256 amountIn) returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)'];

const provider = new ethers.JsonRpcProvider(BASE_RPC_URL, BASE_CHAIN_ID, { staticNetwork: true });
const factory = new ethers.Contract(AERODROME_CL_FACTORY_NEWEST, FACTORY_ABI, provider);
const quoter = new ethers.Contract(AERODROME_MIXED_QUOTER, QUOTER_ABI, provider);

interface PoolFinding {
  tickSpacing: number;
  poolAddress: string;
  usdcIsToken0: boolean;
  liquidity: string;
  quoterOut1Usdc: string | null;
  quoterError: string | null;
}
interface Probe {
  symbol: string;
  underlyingSymbol: string;
  name: string;
  contractAddress: string;
  availability: string;
  decimalsOnChain: number | null;
  decimalsError: string | null;
  pools: PoolFinding[];
  verdict: string;
}

/** The path filler the live quoter uses: tickSpacing OR'd with the newest CL factory bitmask. */
function encodePath(tokenIn: string, tickSpacing: number, tokenOut: string): string {
  return ethers.solidityPacked(['address', 'int24', 'address'], [tokenIn, tickSpacing | AERODROME_CL_FACTORY2_BITMASK, tokenOut]);
}

async function readDecimals(address: string): Promise<{ value: number | null; error: string | null }> {
  try {
    const value = Number(await new ethers.Contract(address, ERC20_ABI, provider).decimals());
    return { value, error: null };
  } catch (e) {
    return { value: null, error: reason(e) };
  }
}

async function probePool(token: string, tickSpacing: number): Promise<PoolFinding | null> {
  let poolAddress: string;
  try {
    poolAddress = await factory.getPool(token, BASE_USDC, tickSpacing);
  } catch {
    return null;
  }
  if (!poolAddress || poolAddress === ethers.ZeroAddress) return null;

  const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);
  let usdcIsToken0 = false;
  let liquidity = '0';
  try {
    const [token0, liq] = await Promise.all([pool.token0(), pool.liquidity()]);
    usdcIsToken0 = String(token0).toLowerCase() === BASE_USDC.toLowerCase();
    liquidity = String(liq);
  } catch { /* pool exists but reads failed — still report the address */ }

  /* The decisive check: does the desk's own quoter resolve this pool for a
     1-USDC buy? A pool that exists but the quoter can't route is not usable. */
  let quoterOut1Usdc: string | null = null;
  let quoterError: string | null = null;
  try {
    const oneUsdc = ethers.parseUnits('1', BASE_USDC_DECIMALS);
    const out = await quoter.quoteExactInput.staticCall(encodePath(BASE_USDC, tickSpacing, token), oneUsdc);
    quoterOut1Usdc = String(out[0]);
  } catch (e) {
    quoterError = reason(e);
  }
  return { tickSpacing, poolAddress, usdcIsToken0, liquidity, quoterOut1Usdc, quoterError };
}

function verdict(p: Probe): string {
  const { status, chosen } = classifyUnlock({ decimalsOnChain: p.decimalsOnChain, pools: p.pools });
  switch (status) {
    case 'decimals_unreadable':
      return 'BLOCKED — decimals() unreadable; verify the contract against the issuer list first.';
    case 'pool_not_routable':
      return 'POOL FOUND, NOT ROUTABLE — a USDC pool exists but MixedRouteQuoterV3 did not route it; likely another factory/venue. Needs code, not just data.';
    case 'no_usdc_pool':
      return 'NO USDC POOL on the newest CL factory. Liquidity may be on another venue (Uniswap, a v2 pool) — that needs an adapter, not a catalog edit.';
    case 'unlockable_data_only':
      return `UNLOCKABLE (data only) — decimals=${p.decimalsOnChain}, routable USDC pool at tickSpacing=${chosen!.tickSpacing}. Confirm depth against the desk floor, then add the VenuePair below and set availability='quote_candidate'.`;
  }
}

function pairSnippet(p: Probe): string | null {
  const { status, chosen } = classifyUnlock({ decimalsOnChain: p.decimalsOnChain, pools: p.pools });
  if (status !== 'unlockable_data_only' || !chosen) return null;
  const best = chosen;
  return [
    `  ${p.symbol}: {`,
    `    venue: AERODROME_VENUE,`,
    `    chainId: BASE_CHAIN_ID,`,
    `    poolAddress: '${ethers.getAddress(best.poolAddress)}',`,
    `    quoteToken: USDC,`,
    `    quoteSymbol: 'USDC',`,
    `    tickSpacing: ${best.tickSpacing},`,
    `    clFactoryBitmask: CL2,`,
    `    liquidityUsdAtVerification: /* TODO price the pool's TVL in USD */ 0,`,
    `    lastVerifiedAt: '${new Date().toISOString().slice(0, 10)}',`,
    `  },   // + set decimals: ${p.decimalsOnChain}, availability: 'quote_candidate' on ${p.symbol}`,
  ].join('\n');
}

function reason(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.length > 120 ? `${msg.slice(0, 117)}…` : msg;
}

function isBlocked(s: TokenizedStock): boolean {
  return !(s.availability === 'quote_candidate' && s.decimals !== null && s.venuePairs.length > 0);
}

async function main() {
  const targets = TOKENIZED_STOCKS
    .filter(isBlocked)
    .filter(s => !onlySymbol || s.symbol.toLowerCase() === onlySymbol || s.underlyingSymbol.toLowerCase() === onlySymbol);

  if (targets.length === 0) {
    console.error(onlySymbol ? `No blocked instrument matches "${onlySymbol}".` : 'Every catalog instrument is already quotable.');
    process.exit(1);
  }

  const probes: Probe[] = [];
  for (const stock of targets) {
    const decimals = await readDecimals(stock.contractAddress);
    const pools: PoolFinding[] = [];
    for (const tickSpacing of TICK_SPACINGS) {
      const finding = await probePool(stock.contractAddress, tickSpacing);
      if (finding) pools.push(finding);
    }
    const probe: Probe = {
      symbol: stock.symbol,
      underlyingSymbol: stock.underlyingSymbol,
      name: stock.name,
      contractAddress: stock.contractAddress,
      availability: stock.availability,
      decimalsOnChain: decimals.value,
      decimalsError: decimals.error,
      pools,
      verdict: '',
    };
    probe.verdict = verdict(probe);
    probes.push(probe);
  }

  if (asJson) {
    console.log(JSON.stringify({ venue: AERODROME_VENUE, factory: AERODROME_CL_FACTORY_NEWEST, quoter: AERODROME_MIXED_QUOTER, probes }, null, 2));
    return;
  }

  console.log(`Aerodrome pool probe · Base ${BASE_CHAIN_ID} · newest CL factory ${AERODROME_CL_FACTORY_NEWEST}`);
  console.log(`RPC ${BASE_RPC_URL} · read-only\n`);
  const snippets: string[] = [];
  for (const p of probes) {
    console.log(`── ${p.symbol} (${p.underlyingSymbol}) · ${p.name} · ${p.availability}`);
    console.log(`   contract ${p.contractAddress}`);
    console.log(`   decimals() → ${p.decimalsOnChain ?? `unreadable (${p.decimalsError})`}`);
    if (p.pools.length === 0) console.log('   USDC pools: none on the newest CL factory');
    for (const pool of p.pools) {
      const routed = pool.quoterOut1Usdc && pool.quoterOut1Usdc !== '0'
        ? `quoter: 1 USDC → ${pool.quoterOut1Usdc} raw`
        : `quoter: not routable (${pool.quoterError ?? 'zero out'})`;
      console.log(`   pool ts=${pool.tickSpacing} ${pool.poolAddress} · liquidity=${pool.liquidity} · USDC=token${pool.usdcIsToken0 ? '0' : '1'} · ${routed}`);
    }
    console.log(`   → ${p.verdict}\n`);
    const snippet = pairSnippet(p);
    if (snippet) snippets.push(`// ${p.symbol}\n${snippet}`);
  }
  if (snippets.length > 0) {
    console.log('Paste-ready VenuePair entries (verify TVL and re-check the issuer list before promoting):\n');
    console.log(snippets.join('\n\n'));
  } else {
    console.log('No instrument is unlockable by a catalog edit alone right now.');
  }
}

main().catch(err => {
  console.error('Probe failed:', reason(err));
  process.exit(1);
});
