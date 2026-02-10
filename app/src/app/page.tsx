/**
 * Root page — routing hub.
 * - First-run installs → /setup
 * - Authenticated users → /dashboard
 * - Unauthenticated visitors → public landing page (satisfies Google's requirement)
 */

import { redirect } from 'next/navigation';
import { isFirstRun } from '@/lib/first-run-check';
import { auth } from '@/lib/auth';
import { LandingPage } from '@/components/marketing/landing-page';

// Must be dynamic — isFirstRun() and auth() need live connections
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const firstRun = await isFirstRun();
  if (firstRun) {
    redirect('/setup');
  }

  const session = await auth();
  if (session?.user) {
    redirect('/dashboard');
  }

  // Unauthenticated visitors see the public landing page
  return <LandingPage />;
}
