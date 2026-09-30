import { decodeBase58, SOLANA_INSTRUMENTS } from '@/lib/solana/catalog';
import { readWalletReadiness } from '@/lib/solana/readiness-rpc';
import { busyResponse, requestBudget } from '@/lib/trading/http';

export const dynamic = 'force-dynamic';

const budget = requestBudget(30);

/**
 * GET /api/desk/jesse/readiness?wallet=<base58>[&mint=<instrument mint>]…
 * Advisory wallet funding check — SOL lamports, USDC token sum, and one
 * xStock token sum per repeated `mint` param (catalog-only). Honest nulls,
 * never guessed balances.
 */
export async function GET(req: Request): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  if (!budget()) return busyResponse();

  const url = new URL(req.url);
  const wallet = url.searchParams.get('wallet') ?? '';
  const mints = url.searchParams.getAll('mint');

  const decoded = decodeBase58(wallet);
  if (!decoded || decoded.length !== 32) {
    return Response.json(
      { error: 'invalid_wallet', message: 'A valid Solana wallet address is required.' },
      { status: 400, headers },
    );
  }
  const instruments = mints.map(mint => SOLANA_INSTRUMENTS.find(i => i.mint === mint));
  if (instruments.some(i => !i)) {
    return Response.json(
      { error: 'unknown_mint', message: 'That mint is not in this desk’s verified catalog.' },
      { status: 400, headers },
    );
  }
  const wanted = instruments.filter((i): i is NonNullable<typeof i> => Boolean(i));

  const readiness = await readWalletReadiness({
    rpcUrl: process.env.SOLANA_RPC_URL ?? 'https://solana-rpc.publicnode.com',
    wallet,
    mints: wanted.map(i => ({ mint: i.mint, decimals: i.decimals })),
  });
  return Response.json({
    wallet,
    solLamports: readiness.solLamports,
    usdc: readiness.usdc,
    token: readiness.holdings[0] ?? null,
    holdings: wanted.map((i, index) => ({ mint: i.mint, symbol: i.symbol, decimals: i.decimals, sum: readiness.holdings[index] ?? null })),
    ok: readiness.ok,
  }, { headers });
}
