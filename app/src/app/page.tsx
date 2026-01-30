/**
 * Home page redirect to dashboard
 */

import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/dashboard');
}
