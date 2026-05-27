'use client';

import { useEffect } from 'react';

export function VersionAnnouncer() {
  useEffect(() => {
    void fetch('/api/system/version-check').catch(() => {});
  }, []);
  return null;
}
