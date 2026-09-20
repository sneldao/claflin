/**
 * Browser Solana wallet port — Wallet Standard / Phantom-shaped providers.
 * Never imports a private key. signTransaction returns signed tx bytes.
 */

import { VersionedTransaction } from '@solana/web3.js';
import type { SolanaNetwork } from './contracts';

export interface SolanaWalletAccount {
  address: string;
  network: SolanaNetwork;
}

export interface SolanaWalletPort {
  getAccount(): SolanaWalletAccount | null;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  signTransaction(transaction: Uint8Array): Promise<Uint8Array>;
  subscribe(listener: () => void): () => void;
}

type SolanaProvider = {
  publicKey?: { toBase58(): string; toString(): string } | null;
  isConnected?: boolean;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toBase58(): string } }>;
  disconnect: () => Promise<void>;
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  off?: (event: string, handler: (...args: unknown[]) => void) => void;
};

function pickProvider(): SolanaProvider | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & {
    solana?: SolanaProvider & { isPhantom?: boolean };
    phantom?: { solana?: SolanaProvider };
    solflare?: SolanaProvider;
  };
  if (w.phantom?.solana) return w.phantom.solana;
  if (w.solana?.isPhantom) return w.solana;
  if (w.solflare) return w.solflare;
  if (w.solana) return w.solana;
  return null;
}

export function createBrowserSolanaWallet(): SolanaWalletPort {
  let account: SolanaWalletAccount | null = null;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const syncFromProvider = (provider: SolanaProvider | null) => {
    const pk = provider?.publicKey;
    account = pk
      ? { address: typeof pk.toBase58 === 'function' ? pk.toBase58() : pk.toString(), network: 'solana:mainnet' }
      : null;
    notify();
  };

  return {
    getAccount() {
      return account;
    },
    async connect() {
      const provider = pickProvider();
      if (!provider) {
        throw new Error('No Solana wallet found. Install Phantom or Solflare to settle live.');
      }
      const result = await provider.connect();
      account = {
        address: result.publicKey.toBase58(),
        network: 'solana:mainnet',
      };
      if (provider.on) {
        provider.on('accountChanged', () => syncFromProvider(provider));
        provider.on('disconnect', () => {
          account = null;
          notify();
        });
      }
      notify();
    },
    async disconnect() {
      const provider = pickProvider();
      try {
        await provider?.disconnect();
      } finally {
        account = null;
        notify();
      }
    },
    async signTransaction(transaction: Uint8Array) {
      const provider = pickProvider();
      if (!provider || !account) {
        throw new Error('Connect a Solana wallet before signing.');
      }
      const tx = VersionedTransaction.deserialize(transaction);
      const signed = await provider.signTransaction(tx);
      return signed.serialize();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
