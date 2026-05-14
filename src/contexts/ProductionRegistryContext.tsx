'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { ProductionRegistryEntry } from '@/lib/proCardTypes';

type ProductionRegistryContextValue = {
  registry: ProductionRegistryEntry[];
  loading: boolean;
  getByName: (name: string) => ProductionRegistryEntry | undefined;
};

const ProductionRegistryContext = createContext<ProductionRegistryContextValue>({
  registry: [],
  loading: false,
  getByName: () => undefined,
});

function normalizeLookup(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function ProductionRegistryProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [registry, setRegistry] = useState<ProductionRegistryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  const load = useCallback(async () => {
    if (!user || fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/production-registry', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json() as { entries: ProductionRegistryEntry[] };
        setRegistry(data.entries ?? []);
      }
    } catch {
      // non-admin users get 403; silently ignore
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchedRef.current = false;
    void load();
  }, [load]);

  const nameIndex = new Map<string, ProductionRegistryEntry>(
    registry.map((e) => [normalizeLookup(e.name), e]),
  );

  function getByName(name: string): ProductionRegistryEntry | undefined {
    return nameIndex.get(normalizeLookup(name));
  }

  return (
    <ProductionRegistryContext.Provider value={{ registry, loading, getByName }}>
      {children}
    </ProductionRegistryContext.Provider>
  );
}

export function useProductionRegistry() {
  return useContext(ProductionRegistryContext);
}
