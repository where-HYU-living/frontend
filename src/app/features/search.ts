import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { SearchResult } from '../../api/types';

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** 통합 검색: 2자 이상부터 서버에 묻는다 (매물·단지·기숙사·양도·주소) */
export function useSearch(q: string) {
  const term = useDebounced(q.trim());
  return useQuery({
    queryKey: ['search', term], enabled: term.length >= 2, retry: false, staleTime: 60_000,
    queryFn: ({ signal }) => api<SearchResult[]>('/search', { query: { q: term }, signal }),
  });
}
