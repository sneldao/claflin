import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decodeFunctionData, parseAbi, type Address } from 'viem';
import { buildAerodromeSwapTx, buildErc20ApproveTx, minimumOut } from '../lib/trading/aerodrome-router';
import { AERODROME_SWAP_ROUTER, BASE_USDC } from '../lib/base-chain';
import { DESK_INSTRUMENTS } from '../lib/trading/catalog';
import { PAPER_ASSUMPTIONS, type QuoteEstimate, type TradeIntent } from '../lib/trading/domain';

const stock = DESK_INSTRUMENTS.find(s => s.symbol === 'GOOGLc')!;
const recipient = '0x000000000000000000000000000000000000dEaD' as Address;

function makeQuote(intent: TradeIntent, now: number): QuoteEstimate {
  return {
    id: 'router-test-quote', kind: 'estimate', mode: 'paper', liveExecutionEnabled: false, intent,
    chainId: 8453, venue: 'aerodrome', poolAddress: stock.venuePairs[0].poolAddress,
    instrumentAddress: stock.contractAddress, instrumentName: stock.name,
    inputSymbol: intent.side === 'buy' ? 'USDC' : stock.symbol,
    outputSymbol: intent.side === 'buy' ? stock.symbol : 'USDC',
    amountInRaw: '10000000', amountOutRaw: '2948502',
    inputAmount: '10', outputAmount: '0.02948502', tokenDecimals: stock.decimals!,
    multiplierRaw: '1000000000000000000', shareEquivalent: '0.02948502',
    reference: { source: 'chainlink', status: 'observed', priceUsdPerToken: '164.20', updatedAt: Math.floor(now / 1000), session: 'unknown', pauseStatus: 'unchecked' },
    blockNumber: 123, blockTimestamp: Math.floor(now / 1000) - 2, quotedAt: now, expiresAt: now + 30000, assumptions: PAPER_ASSUMPTIONS,
  };
}

const swapRouterAbi = parseAbi([
  'function exactInputSingle((address tokenIn, address tokenOut, int24 tickSpacing, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
]);

const approveAbi = parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']);

describe('aerodrome router call builder', () => {
  const now = Date.now();

  it('builds a buy swap with the known exactInputSingle selector', () => {
    const intent: TradeIntent = { instrumentId: stock.id, side: 'buy', unit: 'USDC', amount: '10' };
    const quote = makeQuote(intent, now);
    const tx = buildAerodromeSwapTx(quote, 50, recipient, BigInt(now + 120));

    assert.equal(tx.to, AERODROME_SWAP_ROUTER);
    assert.equal(tx.value, 0n);
    assert.equal(tx.data.slice(0, 10), '0xa026383e');

    const decoded = decodeFunctionData({ abi: swapRouterAbi, data: tx.data });
    assert.equal(decoded.functionName, 'exactInputSingle');
    const [params] = decoded.args as [{ tokenIn: Address; tokenOut: Address; tickSpacing: number; recipient: Address; deadline: bigint; amountIn: bigint; amountOutMinimum: bigint; sqrtPriceLimitX96: bigint }];
    assert.equal(params.tokenIn, BASE_USDC);
    assert.equal(params.tokenOut.toLowerCase(), stock.contractAddress.toLowerCase());
    assert.equal(params.tickSpacing, stock.venuePairs[0].tickSpacing);
    assert.equal(params.recipient, recipient);
    assert.equal(params.amountIn, 10000000n);
    assert.equal(params.deadline, BigInt(now + 120));
    assert.equal(params.amountOutMinimum, 2933759n); // 0.5% slippage of 2,948,502 (floor)
    assert.equal(params.sqrtPriceLimitX96, 0n);
  });

  it('builds a sell swap with the stock token as input', () => {
    const intent: TradeIntent = { instrumentId: stock.id, side: 'sell', unit: 'token', amount: '0.02948502' };
    const quote = makeQuote(intent, now);
    quote.inputSymbol = stock.symbol;
    quote.outputSymbol = 'USDC';
    const tx = buildAerodromeSwapTx(quote, 100, recipient, BigInt(now + 120));

    const decoded = decodeFunctionData({ abi: swapRouterAbi, data: tx.data });
    const [params] = decoded.args as [{ tokenIn: Address; tokenOut: Address }];
    assert.equal(params.tokenIn.toLowerCase(), stock.contractAddress.toLowerCase());
    assert.equal(params.tokenOut, BASE_USDC);
  });

  it('builds an ERC-20 approve call for the input token', () => {
    const tx = buildErc20ApproveTx(BASE_USDC, AERODROME_SWAP_ROUTER, 10000000n);
    assert.equal(tx.to, BASE_USDC);
    assert.equal(tx.data.slice(0, 10), '0x095ea7b3');

    const decoded = decodeFunctionData({ abi: approveAbi, data: tx.data });
    const [spender, amount] = decoded.args as [Address, bigint];
    assert.equal(spender, AERODROME_SWAP_ROUTER);
    assert.equal(amount, 10000000n);
  });

  it('computes a non-zero minimum output even for tiny quotes', () => {
    assert.equal(minimumOut(100n, 50), 99n); // 0.5% of 100 is 99 (floor), non-zero
    assert.equal(minimumOut(10000n, 0), 10000n);
    assert.equal(minimumOut(10000n, 100), 9900n); // 1% slippage
  });
});
