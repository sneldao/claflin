import type { Metadata } from 'next';
import { NightDesk } from '@/components/night-desk/NightDesk';

const title = 'The Night Desk — experience study';
const description = 'An interactive Claflin experience study with a 3D brokerage room, scripted conversation, and fictional market data. No microphone, wallet, or trades.';

export const metadata: Metadata = {
  title,
  description,
  robots: { index: false, follow: false },
  alternates: { canonical: '/night-desk' },
  openGraph: { title, description, url: '/night-desk', images: [] },
  twitter: { card: 'summary', title, description, images: [] },
};

export default function NightDeskPage() {
  return <NightDesk />;
}
