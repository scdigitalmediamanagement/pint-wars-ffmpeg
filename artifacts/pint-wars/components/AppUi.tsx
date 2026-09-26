import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewProps,
} from 'react-native';
import { useColors } from '@/hooks/useColors';

export function Screen({ children, style, ...props }: ViewProps) {
  const colors = useColors();
  return (
    <View {...props} style={[styles.screen, { backgroundColor: colors.background }, style]}>
      {children}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'quiet' | 'destructive';
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  const colors = useColors();
  const backgroundColor =
    variant === 'primary'
      ? colors.primary
      : variant === 'secondary'
        ? colors.accent
        : colors.secondary;
  const textColor =
    variant === 'destructive'
      ? colors.destructive
      : variant === 'quiet'
        ? colors.foreground
        : variant === 'secondary'
          ? colors.accentForeground
          : colors.primaryForeground;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor, opacity: disabled || loading ? 0.55 : pressed ? 0.78 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color={textColor} /> : <Text style={[styles.buttonText, { color: textColor }]}>{label}</Text>}
    </Pressable>
  );
}

export const Field = React.forwardRef<TextInput, { label: string } & TextInputProps>(function Field({ label, ...props }, ref) {
  const colors = useColors();
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <TextInput
        ref={ref}
        {...props}
        placeholderTextColor={colors.mutedForeground}
        style={[styles.field, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.input }]}
      />
    </View>
  );
});

export function Card({ children, style }: ViewProps) {
  const colors = useColors();
  return <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, style]}>{children}</View>;
}

export function Title({ children, eyebrow }: { children: React.ReactNode; eyebrow?: string }) {
  const colors = useColors();
  return (
    <View style={styles.titleBlock}>
      {eyebrow ? <Text style={[styles.eyebrow, { color: colors.accent }]}>{eyebrow}</Text> : null}
      <Text style={[styles.title, { color: colors.foreground }]}>{children}</Text>
    </View>
  );
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return <Text style={[styles.error, { color: colors.destructive }]}>{children}</Text>;
}

export const uiStyles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});

const styles = StyleSheet.create({
  screen: { flex: 1 },
  button: { minHeight: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  buttonText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  fieldWrap: { gap: 8 },
  fieldLabel: { fontFamily: 'Inter_500Medium', fontSize: 13 },
  field: { minHeight: 52, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, fontFamily: 'Inter_400Regular', fontSize: 16 },
  card: { borderWidth: 1, borderRadius: 24, padding: 18 },
  titleBlock: { gap: 7, marginBottom: 22 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' },
  title: { fontFamily: 'Inter_700Bold', fontSize: 32, lineHeight: 38 },
  error: { fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 20 },
});