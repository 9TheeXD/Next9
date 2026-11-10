'use client';

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';

export default function ViewLogger() {
  const { status } = useSession();
  const loggedRef = useRef(false);

  useEffect(() => {
    if (status === 'authenticated' && !loggedRef.current) {
      loggedRef.current = true;
      fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'view' })
      }).catch(err => console.error('Failed to log view', err));
    }
  }, [status]);

  return null;
}
