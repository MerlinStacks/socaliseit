/**
 * Root page — routing hub.
 * - First-run installs → /setup
 * - Authenticated users → /dashboard
 * - Unauthenticated visitors → public landing page (satisfies Google's requirement)
 *
 * Why: Proxy handles auth for /dashboard routes, but this page still needs
 * to check session to decide between redirect and landing page. isFirstRun()
 * is cached in-memory after first check so subsequent hits are O(1).
 */

import { redirect } from 'next/navigation';
import { isFirstRun } from '@/lib/first-run-check';
import { getSession } from '@/lib/auth';
import { LandingPage } from '@/components/marketing/landing-page';

export default async function HomePage() {
  const [firstRun, session] = await Promise.all([
    isFirstRun(),
    getSession(),
  ]);

  if (firstRun) {
    redirect('/setup');
  }

  if (session?.user) {
    redirect('/dashboard');
  }

  // Unauthenticated visitors see the public landing page
  return <LandingPage />;
}

