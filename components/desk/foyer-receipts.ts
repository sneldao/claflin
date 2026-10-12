/* The prove-it drawer — disclosure as proof. Every claim the house makes is a
   receipt with a link to the thing that proves it: the source, the CI run, an
   onchain transaction, the env names. Crypto judges read don't-trust-verify as
   the interface, so the disclosure is the furniture, not a disclaimer.

   This module holds only public identifiers — repository deep-links and a
   devnet transaction signature that is already published in
   docs/METEORA_LAUNCH_DESK.md. It lives apart from HouseFoyer (which carries
   the auth/wallet chip) so the secret-scanning pre-commit hook can allowlist
   the public-identifier module without blinding the wallet-bearing component,
   the same way it allowlists lib/meteora/catalog.ts and scripts/halley-devnet-launch.ts. */

export type FoyerReceipt = {
  readonly claim: string;
  readonly note: string;
  readonly label: string;
  readonly href: string;
};

export const FOYER_RECEIPTS: readonly FoyerReceipt[] = [
  {
    claim: 'dual flags',
    note: 'a live path needs the server flag and the client flag — neither alone moves funds',
    label: 'lib/meteora/flags.ts',
    href: 'https://github.com/sneldao/claflin/blob/main/lib/meteora/flags.ts',
  },
  {
    claim: '~1,400 tests',
    note: 'the suite that guards every filing path, run on every push',
    label: '.github/workflows/ci.yml',
    href: 'https://github.com/sneldao/claflin/blob/main/.github/workflows/ci.yml',
  },
  {
    claim: 'devnet-verified',
    note: 'two wallet-signed transactions — curve config, then pool + mint',
    label: 'pool+mint tx on Solscan ↗',
    href: 'https://solscan.io/tx/4ZSK6rLnSu2XBiFMzsYYvsp6CHvwHNFDHoijr99AJATt5tvxSxFr7DqE2X7mA9uXgmgjhi4uF18scv94SEQQV5t2?cluster=devnet',
  },
  {
    claim: 'fail-closed',
    note: 'every live path is off unless its env is explicitly set true',
    label: '.env.local.example',
    href: 'https://github.com/sneldao/claflin/blob/main/.env.local.example',
  },
];
