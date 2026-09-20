import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { NightDesk } from '@/components/night-desk/NightDesk';

const title = 'The Room — live Jesse view';
const description = 'Canonical Room view of Jesse’s Solana desk. Same paper and line as Compact; the room is presentation only.';

export const metadata: Metadata = {
  title,
  description,
  robots: { index: false, follow: false },
  alternates: { canonical: '/?desk=jesse&view=room' },
  openGraph: { title, description, url: '/?desk=jesse&view=room', images: [] },
  twitter: { card: 'summary', title, description, images: [] },
};

/**
 * Canonical Room view is `/?desk=jesse&view=room` (live controller).
 * Fixture study remains at `?study=1` and at `/desk-study` in development.
 */
export default async function NightDeskPage({
  searchParams,
}: {
  searchParams: Promise<{ study?: string | string[] }>;
}) {
  const params = await searchParams;
  const study = Array.isArray(params.study) ? params.study[0] : params.study;
  if (study === '1') {
    return <NightDesk />;
  }
  redirect('/?desk=jesse&view=room');
}
