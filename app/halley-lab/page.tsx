import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HalleyLab } from './lab';

export const metadata: Metadata = {
  title: 'Halley launch-desk lab',
  description: 'Development-only study page for the watch screen, share card, celebration and live curve preview.',
  robots: { index: false, follow: false },
};

export default function HalleyLabPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <HalleyLab />;
}
