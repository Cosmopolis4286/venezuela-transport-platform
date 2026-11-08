import { devicePreference, useApi } from '@vtp/mobile-core';
import {
  openServices,
  SERVICES,
  todayInVenezuela,
  type Service,
  type ServiceArea,
  type ServicesStatus,
  type StopSummary,
} from '@vtp/shared-types';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface SearchState {
  from: StopSummary | null;
  to: StopSummary | null;
  /** Local date, `YYYY-MM-DD`. */
  date: string;
  /** Services on sale now (ADR-029); a selector is shown only for two. */
  openServices: Service[];
  /** The service being searched: the passenger's last choice if it is on sale. */
  service: Service;
  /** Active corridors, whose stops the suburban search offers. */
  areas: ServiceArea[];
  setStop: (field: 'from' | 'to', stop: StopSummary) => void;
  setDate: (date: string) => void;
  /** Switches service, forgets the stops (they belong to the other one) and remembers it. */
  setService: (service: Service) => void;
  swap: () => void;
  reloadServices: () => Promise<void>;
}

const SearchContext = createContext<SearchState | null>(null);

/** Remembered on the phone, so a daily suburban rider opens the app on their own search. */
const servicePreference = devicePreference('vtp.service');

/** The trip being searched, shared by the search, stop picker and results screens. */
export function SearchProvider({ children }: { children: ReactNode }) {
  const [from, setFrom] = useState<StopSummary | null>(null);
  const [to, setTo] = useState<StopSummary | null>(null);
  const [date, setDate] = useState(() => todayInVenezuela());
  const [chosen, setChosen] = useState<Service | null>(null);
  const status = useApi<ServicesStatus>('/platform/services', { auth: false });

  useEffect(() => {
    void servicePreference.load().then((saved) => {
      if (saved && (SERVICES as readonly string[]).includes(saved)) {
        setChosen((current) => current ?? (saved as Service));
      }
    });
  }, []);

  const value = useMemo<SearchState>(() => {
    // Until the status loads (or if it fails), intercity: the app as it always was.
    const open = status.data ? openServices(status.data) : ['intercity' as const];
    const service = chosen && open.includes(chosen) ? chosen : (open[0] ?? 'intercity');
    return {
      from,
      to,
      date,
      openServices: open,
      service,
      areas: status.data?.suburban.areas ?? [],
      setStop: (field, stop) => (field === 'from' ? setFrom(stop) : setTo(stop)),
      setDate,
      setService: (next) => {
        if (next === service) return;
        setChosen(next);
        setFrom(null);
        setTo(null);
        void servicePreference.save(next);
      },
      swap: () => {
        setFrom(to);
        setTo(from);
      },
      reloadServices: status.reload,
    };
  }, [from, to, date, chosen, status.data, status.reload]);
  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export function useSearch(): SearchState {
  const value = useContext(SearchContext);
  if (!value) throw new Error('useSearch must be used inside <SearchProvider>');
  return value;
}
