'use client';

import { useEffect } from 'react';
import packageJson from '../../package.json';

const APP_VERSION = packageJson.version;
const VERSION_CHECK_STORAGE_KEY = `tv-version-check:${APP_VERSION}`;

export function VersionAnnouncer() {
  useEffect(() => {
    try {
      if (window.localStorage.getItem(VERSION_CHECK_STORAGE_KEY) === 'done') return;
    } catch {}

    void fetch('/api/system/version-check')
      .then((response) => {
        if (!response.ok) return;
        try {
          window.localStorage.setItem(VERSION_CHECK_STORAGE_KEY, 'done');
        } catch {}
      })
      .catch(() => {});
  }, []);
  return null;
}
