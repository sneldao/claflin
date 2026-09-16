import type { Metadata } from 'next';
import { NightDesk } from '@/components/night-desk/NightDesk';
import { notFound } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Night Desk experience study',
  description: 'An experiential study for Claflin: Jesse’s Solana night desk with scripted conversation, evidence, and example slips. Not a live brokerage service.',
  robots: { index: false, follow: false },
};

export default function DeskStudyPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <NightDesk />;
}
