import { Banner } from '@vtp/mobile-core';
import { localTime, toNetworkIso } from '@vtp/shared-types';

/** Shown over a screen whose data is the copy saved on the phone (no signal, ADR-051). */
export function SavedAt({ savedAt }: { savedAt: string }) {
  return (
    <Banner tone="warning">
      Sin señal: ves lo guardado a las {localTime(toNetworkIso(savedAt))}.
    </Banner>
  );
}
