'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/context/UserContext';

// Bare /agent (no name) has no page of its own — send the visitor somewhere
// useful instead of a 404: to their own login page if a user is already
// picked on this browser, otherwise to the home name-picker.
export default function AgentIndexRedirect() {
  const router = useRouter();
  const { user } = useUser();

  useEffect(() => {
    router.replace(user ? `/agent/${user.id}` : '/');
  }, [user, router]);

  return null;
}
