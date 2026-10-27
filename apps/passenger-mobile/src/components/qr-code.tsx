import createQr from 'qrcode-generator';
import { useMemo } from 'react';
import { View } from 'react-native';

const QUIET_ZONE = 4;

/** Runs of equal modules per row, so a row renders as a few views instead of one per module. */
function qrRows(value: string): { dark: boolean; length: number }[][] {
  const qr = createQr(0, 'M');
  qr.addData(value);
  qr.make();
  const count = qr.getModuleCount();
  return Array.from({ length: count }, (_, row) => {
    const runs: { dark: boolean; length: number }[] = [];
    for (let col = 0; col < count; col++) {
      const dark = qr.isDark(row, col);
      const last = runs[runs.length - 1];
      if (last && last.dark === dark) last.length++;
      else runs.push({ dark, length: 1 });
    }
    return runs;
  });
}

/**
 * A QR code drawn with plain views (no native module). Always black on white, also in dark mode,
 * so scanners read it.
 */
export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const rows = useMemo(() => qrRows(value), [value]);
  const cell = Math.floor(size / (rows.length + QUIET_ZONE * 2));
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="Código QR del boleto"
      style={{ backgroundColor: '#ffffff', padding: cell * QUIET_ZONE, alignSelf: 'center' }}
    >
      {rows.map((runs, row) => (
        <View key={row} style={{ flexDirection: 'row' }}>
          {runs.map((run, i) => (
            <View
              key={i}
              style={{
                width: run.length * cell,
                height: cell,
                backgroundColor: run.dark ? '#000000' : '#ffffff',
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
