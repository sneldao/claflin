export const dynamic = 'force-dynamic';

const NAME = /^[\w .'&-]{2,40}$/;
const SYMBOL = /^[A-Z0-9]{2,10}$/;
const ANCHOR = /^[A-Z0-9.]{1,10}$/;

/**
 * GET /api/desk/halley/token-metadata?symbol=…&name=…[&anchor=…]
 * The Metaplex metadata URI embedded in a live launch. It says plainly what
 * the mint is — a tracker/exposure token launched from the creator's own
 * wallet — and what it is not: stock ownership, or an issuance of the
 * referenced equity. Name/symbol are validated against the same grammar the
 * launch intent enforces, so an arbitrary string cannot ride the URI.
 */
export async function GET(req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const symbol = (params.get('symbol') ?? '').toUpperCase();
  const name = (params.get('name') ?? '').slice(0, 40);
  const anchor = params.get('anchor') ? params.get('anchor')!.toUpperCase() : null;
  if (!SYMBOL.test(symbol) || !NAME.test(name) || (anchor !== null && !ANCHOR.test(anchor))) {
    return Response.json({ error: 'invalid_request' }, { status: 400 });
  }

  const description = anchor
    ? `${name} (${symbol}) is a tracker/exposure token launched via Claflin on a Meteora DBC curve, opened with a ${anchor} equity-mark price anchor. It is not, and does not claim to be, stock ownership or an issuance of ${anchor}.`
    : `${name} (${symbol}) is a tracker/exposure token launched via Claflin on a Meteora DBC curve. It is not, and does not claim to be, stock ownership or an issuance of any equity.`;

  return Response.json(
    {
      name: name.slice(0, 32),
      symbol,
      description,
      external_url: 'https://claflin.trustfall.xyz/?desk=halley',
      attributes: [
        { trait_type: 'kind', value: 'tracker-token' },
        { trait_type: 'venue', value: 'meteora-dbc' },
        { trait_type: 'launch_desk', value: 'claflin' },
        ...(anchor ? [{ trait_type: 'price_anchor', value: anchor }] : []),
        { trait_type: 'is_stock_ownership', value: 'false' },
      ],
      properties: { category: 'fungible' },
    },
    { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } },
  );
}
