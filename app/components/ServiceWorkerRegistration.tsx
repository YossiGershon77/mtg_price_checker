'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    // Check if we are in the browser and if service workers are supported
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((reg) => console.log('Sniper Service Worker Registered!', reg.scope))
          .catch((err) => console.error('Service Worker Registration Failed:', err));
      });
    }
  }, []);

  return null;
}

