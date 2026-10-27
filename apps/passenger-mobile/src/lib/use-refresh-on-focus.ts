import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

/** Reloads data when the user comes back to a screen (not on the first focus, which already loads). */
export function useRefreshOnFocus(reload: () => Promise<void>) {
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      void reload();
    }, [reload]),
  );
}
