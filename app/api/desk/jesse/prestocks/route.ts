import {
  fetchPreStockProducts,
  findPreStockProduct,
  buildPreStockDuplex,
  unavailablePreStockDuplex,
} from '@/lib/solana/market/prestocks';
import { busyResponse, requestBudget } from '@/lib/trading/http';

export const dynamic = 'force-dynamic';

const prestocksBudget = requestBudget(40);

/**
 * GET /api/desk/jesse/prestocks
 * GET /api/desk/jesse/prestocks?symbol=ANDURIL
 *
 * Secondary Stocklana duplex: issuer mark vs issuer token price.
 * Evidence-only — never a paper filing path. Failures return 200 with
 * status unavailable (or a list envelope), never synthetic success.
 */

export async function GET(req: Request): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };
  if (!prestocksBudget()) return busyResponse();
  const symbol = new URL(req.url).searchParams.get('symbol');

  try {
    const products = await fetchPreStockProducts();
    if (!symbol) {
      return Response.json({
        version: 1,
        source: 'prestocks',
        products: products.map(p => ({
          symbol: p.symbol,
          name: p.name,
          mint: p.contract_address,
          externalUrl: p.external_url ?? null,
        })),
        disclaimer:
          'Issuer-provided SPV marks — not public equity quotes. Evidence only; Jesse does not file PreStocks paper in this release.',
      }, { headers });
    }

    const product = findPreStockProduct(products, symbol);
    if (!product) {
      return Response.json(unavailablePreStockDuplex(symbol, ['unknown-symbol']), { headers });
    }
    return Response.json(buildPreStockDuplex(product), { headers });
  } catch (err) {
    const code = err instanceof Error && err.message === 'issuer-payload-invalid'
      ? 'issuer-payload-invalid' as const
      : 'issuer-api-unavailable' as const;
    return Response.json(unavailablePreStockDuplex(symbol, [code]), { headers });
  }
}
