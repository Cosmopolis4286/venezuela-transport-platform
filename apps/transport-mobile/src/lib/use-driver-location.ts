import { useAuth } from '@vtp/mobile-core';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

/** How often, at most, the position goes to the API while online. */
const SEND_EVERY_MS = 15_000;

export type LocationSharing = 'off' | 'asking' | 'sharing' | 'denied' | 'unavailable';

/**
 * While the driver is online, shares their position with the API (ADR-041): nearby requests reach
 * them first, and the passenger who booked them sees them coming. Only with the app open
 * (foreground permission); never while offline. Without permission everything still works,
 * only without the nearby priority.
 */
export function useDriverLocation(online: boolean): LocationSharing {
  const { api } = useAuth();
  const [state, setState] = useState<Exclude<LocationSharing, 'off'>>('asking');

  useEffect(() => {
    if (!online) return;
    let subscription: Location.LocationSubscription | undefined;
    let cancelled = false;
    let lastSent = 0;
    const send = (position: Location.LocationObject) => {
      if (Date.now() - lastSent < SEND_EVERY_MS) return;
      lastSent = Date.now();
      void api
        .request('/me/taxi/location', {
          method: 'PUT',
          body: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            ...(typeof position.coords.accuracy === 'number'
              ? { accuracyMeters: Math.round(position.coords.accuracy) }
              : {}),
          },
        })
        .catch(() => undefined); // offline for a moment: the next one goes
    };
    void (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (permission.status !== 'granted') {
          setState('denied');
          return;
        }
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: SEND_EVERY_MS,
            distanceInterval: 50,
          },
          send,
        );
        if (cancelled) subscription.remove();
        else setState('sharing');
      } catch {
        if (!cancelled) setState('unavailable');
      }
    })();
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [online, api]);

  return online ? state : 'off';
}
