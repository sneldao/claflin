import { decodeBase58, SOLANA_INSTRUMENTS } from '@/lib/solana/catalog';
import { readWalletReadiness } from '@/lib/solana/readiness-rpc';
import { busyResponse, requestBudget } from '@/lib/trading/http';

export const dynamic = 'force-dynamic';

const budget = requestBudget(30);

/**
 * GET /api/desk/jesse/readiness?wallet=<base58>&mint=<optional instrument mint>
 * Advisory wallet funding check — SOL lamports, USDC token sum, and an
 * optional xStock token sum. Honest nulls, never guessed balances.
 */
export async function GET(req: Request): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  if (!budget()) return busyResponse();

  const url = new URL(req.url);
  const wallet = url.searchParams.get('wallet') ?? '';
  const mint = url.searchParams.get('mint');

  const decoded = decodeBase58(wallet);
  if (!decoded || decoded.length !== 32) {
    return Response.json(
      { error: 'invalid_wallet', message: 'A valid Solana wallet address is required.' },
      { status: 400, headers },
    );
  }
  const instrument = mint !== null ? SOLANA_INSTRUMENTS.find(i => i.mint === mint) : undefined;
  if (mint !== null && !instrument) {
    return Response.json(
      { error: 'unknown_mint', message: 'That mint is not in this desk’s verified catalog.' },
      { status: 400, headers },
    );
  }

  const readiness = await readWalletReadiness({
    rpcUrl: process.env.SOLANA_RPC_URL ?? 'https://solana-rpc.publicnode.com',
    wallet,
    mint,
    mintDecimals: instrument?.decimals,
  });
  return Response.json({ wallet, ...readiness }, { headers });
}
