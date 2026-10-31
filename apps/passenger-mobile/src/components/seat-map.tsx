import { useColors } from '@vtp/mobile-core';
import type { TripAvailability } from '@vtp/shared-types';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '@/i18n/use-t';

/**
 * Seat map of a trip: taken seats are disabled, selected ones highlighted. Schedules without a
 * map get a plain grid of numbered seats, four per row.
 */
export function SeatMap({
  trip,
  selected,
  onToggle,
}: {
  trip: TripAvailability;
  selected: string[];
  onToggle: (seat: string) => void;
}) {
  const colors = useColors();
  const { t } = useT();
  const layout =
    trip.layout ??
    (() => {
      const columns = 4;
      return {
        decks: 1,
        rows: Math.ceil(trip.capacity / columns),
        columns,
        seats: Array.from({ length: trip.capacity }, (_, i) => ({
          number: String(i + 1),
          deck: 0,
          row: Math.floor(i / columns),
          column: i % columns,
        })),
      };
    })();
  const taken = new Set(trip.takenSeats);

  return (
    <View style={styles.decks}>
      {Array.from({ length: layout.decks }, (_, deck) => (
        <View key={deck} style={styles.deck}>
          {layout.decks > 1 ? (
            <Text style={[styles.deckLabel, { color: colors.text }]}>{t.seatMap.decks[deck]}</Text>
          ) : null}
          <View
            style={[styles.body, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            {Array.from({ length: layout.rows }, (_, row) => (
              <View key={row} style={styles.row}>
                {Array.from({ length: layout.columns }, (_, column) => {
                  const seat = layout.seats.find(
                    (s) => s.deck === deck && s.row === row && s.column === column,
                  );
                  if (!seat) return <View key={column} style={styles.cell} />;
                  const isTaken = taken.has(seat.number);
                  const isSelected = selected.includes(seat.number);
                  return (
                    <Pressable
                      key={column}
                      accessibilityRole="button"
                      accessibilityLabel={t.seatMap.seatA11y(
                        seat.number,
                        isTaken ? 'taken' : isSelected ? 'selected' : 'free',
                      )}
                      accessibilityState={{ disabled: isTaken, selected: isSelected }}
                      disabled={isTaken}
                      onPress={() => onToggle(seat.number)}
                      style={[
                        styles.cell,
                        styles.seat,
                        {
                          borderColor: isSelected ? colors.primary : colors.border,
                          backgroundColor: isTaken
                            ? colors.border
                            : isSelected
                              ? colors.primary
                              : colors.card,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '600',
                          color: isSelected
                            ? colors.primaryText
                            : isTaken
                              ? colors.muted
                              : colors.text,
                        }}
                      >
                        {seat.number}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  decks: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'center' },
  deck: { gap: 6, alignItems: 'center' },
  deckLabel: { fontSize: 13, fontWeight: '600' },
  body: {
    borderWidth: 2,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 10,
    paddingTop: 22,
    gap: 6,
  },
  row: { flexDirection: 'row', gap: 6 },
  cell: { width: 40, height: 40 },
  seat: { borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
