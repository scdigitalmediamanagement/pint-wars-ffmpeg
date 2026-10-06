import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import homeColors from '@/constants/homeColors';

const palette = {
  ...homeColors,
  error: '#ff8c83',
  buttonTop: '#ffdc61',
  buttonBottom: '#f3bd28',
};

export const authColors = {
  text: palette.text,
  gold: palette.gold,
  muted: palette.muted,
  error: palette.error,
};

function withOpacity(hexColor: string, opacity: number) {
  const hex = hexColor.replace('#', '');
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

type AuthScreenProps = React.PropsWithChildren<{
  contentStyle?: StyleProp<ViewStyle>;
}>;

export function AuthScreen({ children, contentStyle }: AuthScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <LinearGradient
        colors={[palette.panel, palette.background, palette.background]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={styles.ambientOrbit}>
        <View style={styles.ambientOrbitOuter} />
        <View style={styles.ambientOrbitMiddle} />
        <View style={styles.ambientOrbitInner} />
      </View>

      <View
        style={[
          styles.brandHeader,
          { height: insets.top + 59, paddingTop: insets.top },
        ]}
      >
        <Image
          source={require('../assets/images/home/pw-reference-crest.png')}
          accessibilityLabel="Pint Wars crest"
          resizeMode="contain"
          style={styles.crest}
        />
        <Image
          source={require('../assets/images/home/pw-reference-wordmark.png')}
          accessibilityLabel="Pint Wars"
          resizeMode="contain"
          style={styles.wordmark}
        />
      </View>

      <KeyboardAwareScrollViewCompat
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 18) + 16 },
          contentStyle,
        ]}
        bottomOffset={24}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

export type AuthFieldProps = TextInputProps & {
  label: string;
};

export const AuthField = React.forwardRef<TextInput, AuthFieldProps>(
  function AuthField(
    { label, style, placeholderTextColor, onFocus, onBlur, ...inputProps },
    ref,
  ) {
    const [focused, setFocused] = React.useState(false);

    return (
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <LinearGradient
          colors={[
            withOpacity(palette.text, 0.055),
            withOpacity(palette.text, 0.025),
          ]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[
            styles.fieldSurface,
            focused && styles.fieldSurfaceFocused,
          ]}
        >
          <TextInput
            ref={ref}
            {...inputProps}
            accessibilityLabel={inputProps.accessibilityLabel ?? label}
            onFocus={(event) => {
              setFocused(true);
              onFocus?.(event);
            }}
            onBlur={(event) => {
              setFocused(false);
              onBlur?.(event);
            }}
            placeholderTextColor={
              placeholderTextColor ?? withOpacity(palette.muted, 0.7)
            }
            selectionColor={palette.gold}
            style={[styles.fieldInput, style]}
          />
        </LinearGradient>
      </View>
    );
  },
);

AuthField.displayName = 'AuthField';

type AuthButtonProps = {
  label: string;
  onPress: () => void | Promise<void>;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  layout?: 'center' | 'centerInline' | 'spread';
  iconBox?: boolean;
};

export function AuthButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  icon,
  layout = 'center',
  iconBox = false,
}: AuthButtonProps) {
  const unavailable = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: unavailable, busy: loading }}
      disabled={unavailable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.buttonPressable,
        unavailable && styles.buttonUnavailable,
        pressed && !unavailable && styles.buttonPressed,
      ]}
    >
      <LinearGradient
        colors={[palette.buttonTop, palette.buttonBottom]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.buttonGradient}
      >
        <View
          style={[
            styles.buttonContent,
            layout === 'centerInline' && styles.buttonContentInline,
            layout === 'spread' && styles.buttonContentSpread,
          ]}
        >
          <Text style={styles.buttonLabel}>
            {loading ? 'Please wait…' : label}
          </Text>
          {loading ? (
            <ActivityIndicator
              color={palette.actionInk}
              size="small"
              style={layout === 'center' ? styles.buttonIconAbsolute : undefined}
            />
          ) : icon ? (
            <View
              style={[
                styles.buttonIcon,
                layout === 'center' && styles.buttonIconAbsolute,
                iconBox && styles.buttonIconBox,
              ]}
              accessible={false}
            >
              {icon}
            </View>
          ) : null}
        </View>
      </LinearGradient>
    </Pressable>
  );
}

type AuthNoticeProps = React.PropsWithChildren<{
  variant: 'error' | 'success';
}>;

export function AuthNotice({ children, variant }: AuthNoticeProps) {
  const tint = variant === 'error' ? palette.error : palette.gold;

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.notice,
        {
          backgroundColor: withOpacity(tint, 0.075),
          borderColor: withOpacity(tint, 0.24),
        },
      ]}
    >
      <View style={[styles.noticeDot, { backgroundColor: tint }]} />
      <Text
        style={[
          styles.noticeText,
          { color: variant === 'error' ? palette.error : palette.text },
        ]}
      >
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: palette.background,
  },
  ambientOrbit: {
    position: 'absolute',
    top: 82,
    right: -98,
    width: 250,
    height: 250,
  },
  ambientOrbitOuter: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 125,
    borderWidth: 1,
    borderColor: withOpacity(palette.gold, 0.045),
  },
  ambientOrbitMiddle: {
    position: 'absolute',
    top: 18,
    right: 18,
    bottom: 18,
    left: 18,
    borderRadius: 107,
    borderWidth: 1,
    borderColor: withOpacity(palette.gold, 0.025),
  },
  ambientOrbitInner: {
    position: 'absolute',
    top: 38,
    right: 38,
    bottom: 38,
    left: 38,
    borderRadius: 87,
    borderWidth: 1,
    borderColor: withOpacity(palette.gold, 0.018),
  },
  brandHeader: {
    zIndex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: withOpacity(palette.text, 0.07),
  },
  crest: {
    width: 23,
    height: 27,
  },
  wordmark: {
    width: 88,
    height: 26,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  field: {
    gap: 8,
  },
  fieldLabel: {
    color: withOpacity(palette.text, 0.92),
    fontFamily: 'DMSans_700Bold',
    fontSize: 12,
    letterSpacing: 0.15,
  },
  fieldSurface: {
    height: 54,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: withOpacity(palette.text, 0.14),
    borderRadius: 13,
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  fieldSurfaceFocused: {
    borderColor: withOpacity(palette.gold, 0.75),
  },
  fieldInput: {
    flex: 1,
    paddingHorizontal: 15,
    paddingVertical: 0,
    color: palette.text,
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
  },
  buttonPressable: {
    minHeight: 54,
    borderRadius: 15,
    shadowColor: palette.gold,
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  buttonGradient: {
    minHeight: 54,
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: withOpacity(palette.text, 0.44),
    borderRadius: 15,
  },
  buttonContent: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 17,
  },
  buttonContentInline: {
    gap: 10,
  },
  buttonContentSpread: {
    justifyContent: 'space-between',
    paddingLeft: 22,
    paddingRight: 17,
  },
  buttonLabel: {
    color: palette.actionInk,
    fontFamily: 'DMSans_700Bold',
    fontSize: 15,
    letterSpacing: -0.2,
  },
  buttonIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonIconAbsolute: {
    position: 'absolute',
    right: 17,
  },
  buttonIconBox: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderColor: withOpacity(palette.actionInk, 0.18),
    borderRadius: 10,
    backgroundColor: withOpacity(palette.text, 0.3),
  },
  buttonUnavailable: {
    opacity: 0.6,
  },
  buttonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 12,
  },
  noticeDot: {
    width: 6,
    height: 6,
    marginTop: 5,
    borderRadius: 3,
  },
  noticeText: {
    flex: 1,
    fontFamily: 'DMSans_500Medium',
    fontSize: 12,
    lineHeight: 18,
  },
});
