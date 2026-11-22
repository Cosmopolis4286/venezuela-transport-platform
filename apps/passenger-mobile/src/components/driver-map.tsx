import type { DriverApproach } from '@vtp/shared-types';
import { StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

/** Shows a little around both points (in degrees). */
const PADDING = 0.6;
const MIN_DELTA = 0.01;

/**
 * Live map of the ride (ADR-047): the driver's last location and, while they come, the pickup
 * point. The ride screen reloads every few seconds, so the marker moves with them. Apple Maps on
 * iOS, Google Maps on Android (key in `GOOGLE_MAPS_ANDROID_API_KEY`).
 */
export function DriverMap({
  approach,
  driverLabel,
  pickupLabel,
}: {
  approach: DriverApproach;
  driverLabel: string;
  pickupLabel: string;
}) {
  const points = [approach, ...(approach.pickup ? [approach.pickup] : [])];
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const region = {
    latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
    longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    latitudeDelta: Math.max(MIN_DELTA, (Math.max(...lats) - Math.min(...lats)) * (1 + PADDING)),
    longitudeDelta: Math.max(MIN_DELTA, (Math.max(...lngs) - Math.min(...lngs)) * (1 + PADDING)),
  };
  return (
    <MapView style={styles.map} region={region} accessibilityLabel={driverLabel}>
      <Marker
        coordinate={{ latitude: approach.latitude, longitude: approach.longitude }}
        title={driverLabel}
        pinColor="#2563eb"
      />
      {approach.pickup ? (
        <Marker coordinate={approach.pickup} title={pickupLabel} pinColor="#16a34a" />
      ) : null}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { width: '100%', height: 220, borderRadius: 12 },
});
