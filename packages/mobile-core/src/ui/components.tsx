import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius, spacing, useColors } from './theme';

/** Scrollable page that keeps inputs above the keyboard. */
export function Screen({
  children,
  safeTop = false,
  refreshControl,
}: {
  children: ReactNode;
  /** Pad for the status bar on screens without a navigation header. */
  safeTop?: boolean;
  refreshControl?: ComponentProps<typeof ScrollView>['refreshControl'];
}) {
  const colors = useColors();
  return (
    <SafeAreaView
      edges={safeTop ? ['top', 'bottom'] : ['bottom']}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.screen}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>
      {children}
    </Text>
  );
}

export function Subheading({ children }: { children: ReactNode }) {
  const colors = useColors();
  return <Text style={[styles.subheading, { color: colors.text }]}>{children}</Text>;
}

export function Body({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  const colors = useColors();
  return (
    <Text style={[styles.body, { color: muted ? colors.muted : colors.text }]}>{children}</Text>
  );
}

export function Field({
  label,
  hint,
  error,
  ...input
}: TextInputProps & { label: string; hint?: string; error?: string }) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={[
          styles.input,
          {
            color: colors.text,
            borderColor: error ? colors.danger : colors.border,
            backgroundColor: input.editable === false ? colors.surface : colors.card,
          },
        ]}
        {...input}
      />
      {error ? (
        <Text style={[styles.small, { color: colors.danger }]}>{error}</Text>
      ) : hint ? (
        <Text style={[styles.small, { color: colors.muted }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'link';
  loading?: boolean;
  disabled?: boolean;
}) {
  const colors = useColors();
  const inactive = disabled || loading;
  const background =
    variant === 'primary' ? colors.primary : variant === 'danger' ? colors.danger : 'transparent';
  const foreground =
    variant === 'primary' ? colors.primaryText : variant === 'danger' ? '#ffffff' : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        variant === 'link' ? styles.link : styles.button,
        {
          backgroundColor: background,
          borderColor: variant === 'secondary' ? colors.border : background,
          opacity: inactive ? 0.5 : pressed ? 0.8 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            { color: foreground },
            variant === 'link' && { textDecorationLine: 'underline' },
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Banner({
  tone,
  children,
}: {
  tone: 'error' | 'success' | 'warning' | 'info';
  children: ReactNode;
}) {
  const colors = useColors();
  const palette = {
    error: [colors.dangerSurface, colors.danger],
    success: [colors.successSurface, colors.success],
    warning: [colors.warningSurface, colors.warning],
    info: [colors.surface, colors.text],
  }[tone];
  return (
    <View
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      style={[styles.banner, { backgroundColor: palette[0], borderColor: palette[1] }]}
    >
      <Text style={[styles.body, { color: palette[1] }]}>{children}</Text>
    </View>
  );
}

export function Card({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {children}
    </View>
  );
}

export function Badge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  const colors = useColors();
  const [background, foreground] = {
    neutral: [colors.surface, colors.text],
    success: [colors.successSurface, colors.success],
    warning: [colors.warningSurface, colors.warning],
    danger: [colors.dangerSurface, colors.danger],
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: background }]}>
      <Text style={[styles.badgeText, { color: foreground }]}>{label}</Text>
    </View>
  );
}

/** Mutually exclusive options shown as a row of chips. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      {label ? <Text style={[styles.label, { color: colors.text }]}>{label}</Text> : null}
      <View accessibilityRole="radiogroup" style={styles.segmented}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              style={[
                styles.segment,
                {
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected ? colors.primary : colors.card,
                },
              ]}
            >
              <Text style={[styles.small, { color: selected ? colors.primaryText : colors.text }]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

export function Centered({ children }: { children: ReactNode }) {
  const colors = useColors();
  return <View style={[styles.centered, { backgroundColor: colors.background }]}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { padding: spacing.lg, gap: spacing.lg, flexGrow: 1 },
  heading: { fontSize: 24, fontWeight: '700' },
  subheading: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 21 },
  small: { fontSize: 13 },
  field: { gap: spacing.xs },
  label: { fontSize: 14, fontWeight: '500' },
  input: {
    borderWidth: 1,
    borderRadius: radius,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.md : spacing.sm,
    fontSize: 16,
  },
  button: {
    minHeight: 46,
    borderRadius: radius,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  link: { minHeight: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 0 },
  buttonText: { fontSize: 16, fontWeight: '600' },
  banner: { borderWidth: 1, borderRadius: radius, padding: spacing.md },
  card: { borderWidth: 1, borderRadius: radius, padding: spacing.lg, gap: spacing.sm },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 12, fontWeight: '600' },
  segmented: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  segment: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap' },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
  },
});
