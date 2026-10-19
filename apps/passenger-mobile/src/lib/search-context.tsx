import { todayInVenezuela, type StopSummary } from '@vtp/shared-types';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface SearchState {
  from: StopSummary | null;
  to: StopSummary | null;
  /** Local date, `YYYY-MM-DD`. */
  date: string;
  setStop: (field: 'from' | 'to', stop: StopSummary) => void;
  setDate: (date: string) => void;
  swap: () => void;
}

const SearchContext = createContext<SearchState | null>(null);

/** The trip being searched, shared by the search, stop picker and results screens. */
export function SearchProvider({ children }: { children: ReactNode }) {
  const [from, setFrom] = useState<StopSummary | null>(null);
  const [to, setTo] = useState<StopSummary | null>(null);
  const [date, setDate] = useState(() => todayInVenezuela());
  const value = useMemo<SearchState>(
    () => ({
      from,
      to,
      date,
      setStop: (field, stop) => (field === 'from' ? setFrom(stop) : setTo(stop)),
      setDate,
      swap: () => {
        setFrom(to);
        setTo(from);
      },
    }),
    [from, to, date],
  );
  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export function useSearch(): SearchState {
  const value = useContext(SearchContext);
  if (!value) throw new Error('useSearch must be used inside <SearchProvider>');
  return value;
}
