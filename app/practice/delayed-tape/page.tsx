import type { Metadata } from 'next';
import { DelayedTapePractice } from '@/components/desk/DelayedTapePractice';

export const metadata: Metadata = {
  title: 'The delayed tape · practice',
  description: 'A labelled historical simulation about delayed prints versus executable quotes. No wallet. No live market.',
  robots: { index: false, follow: false },
};

export default function DelayedTapePage() {
  return <DelayedTapePractice />;
}
