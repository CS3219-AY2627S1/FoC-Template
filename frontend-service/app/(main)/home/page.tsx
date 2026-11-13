import type { Metadata } from 'next';

import { FavorFeed } from '@/components/feed/favor-feed';
import { loadOpenOrders } from '@/lib/order-actions';

export const metadata: Metadata = { title: 'Feed · Friend on Campus' };

export default async function HomePage() {
  return <FavorFeed initial={await loadOpenOrders()} />;
}
