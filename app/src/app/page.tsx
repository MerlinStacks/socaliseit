/**
 * Home page redirect
 * Fresh installs go to /setup, existing installs go to /dashboard
 */

import { redirect } from 'next/navigation';
import { isFirstRun } from '@/lib/first-run-check';

// Must be dynamic — isFirstRun() needs a live database connection
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const firstRun = await isFirstRun();
  redirect(firstRun ? '/setup' : '/dashboard');
}
