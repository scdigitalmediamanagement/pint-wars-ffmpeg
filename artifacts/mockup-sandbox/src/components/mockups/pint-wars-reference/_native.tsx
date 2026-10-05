import React, { type CSSProperties, type ReactNode } from 'react';
import { Bell, Compass, ChevronRight, ArrowRight, Flag, PlusCircle, LogIn } from 'lucide-react';

type NativeStyle = Record<string, unknown>;
type Styles = NativeStyle | (NativeStyle | false | undefined)[] | undefined;
type NativeProps = { children?: ReactNode; style?: Styles; contentContainerStyle?: Styles; onPress?: () => void; disabled?: boolean; accessibilityRole?: string; accessibilityState?: unknown; testID?: string; numberOfLines?: number; showsVerticalScrollIndicator?: boolean; refreshControl?: ReactNode };
function css(styles: Styles): CSSProperties {
  const s = Object.assign({}, ...(Array.isArray(styles) ? styles.filter(Boolean) : [styles ?? {}]));
  const result = { ...s };
  for (const axis of ['Horizontal', 'Vertical']) {
    for (const prop of ['padding', 'margin']) {
      const key = prop + axis;
      if (key in result) {
        for (const side of axis === 'Horizontal' ? ['Left', 'Right'] : ['Top', 'Bottom']) result[prop + side] = result[key];
        delete result[key];
      }
    }
  }
  if (typeof result.lineHeight === 'number') result.lineHeight = `${result.lineHeight}px`;
  if (typeof result.fontFamily === 'string' && result.fontFamily.startsWith('Inter_')) {
    result.fontWeight = Number(result.fontFamily.substring(6, 9));
    result.fontFamily = 'Inter, sans-serif';
  }
  for (const key of ['shadowColor', 'shadowOffset', 'shadowOpacity', 'shadowRadius', 'elevation']) delete result[key];
  if (result.borderWidth) result.borderStyle = 'solid';
  return result as CSSProperties;
}
export function View({ children, style }: NativeProps) { return <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, ...css(style) }}>{children}</div>; }
export function Text({ children, style }: NativeProps) { return <div style={css(style)}>{children}</div>; }
export function Pressable({ children, style, onPress, disabled, testID }: Omit<NativeProps, 'style'> & { style?: Styles | ((state: { pressed: boolean }) => Styles) }) {
  return <button data-testid={testID} disabled={disabled} onClick={onPress} style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', border: 0, padding: 0, background: 'transparent', ...css(typeof style === 'function' ? style({ pressed: false }) : style) }}>{children}</button>;
}
export function ScrollView({ children, contentContainerStyle }: NativeProps) { return <div style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', ...css(contentContainerStyle) }}>{children}</div>; }
export function ActivityIndicator({ color }: { color: string }) { return <span style={{ color }}>Loading…</span>; }
export function RefreshControl(_props: { refreshing: boolean; onRefresh: () => Promise<void>; tintColor: string; colors: string[] }) { return null; }
export const StyleSheet = { create: <T extends Record<string, NativeStyle>>(styles: T) => styles };
export const AppState = { addEventListener: (_: string, __: (state: string) => void) => ({ remove() {} }) };
const icons = { bell: Bell, compass: Compass, 'chevron-right': ChevronRight, 'arrow-right': ArrowRight, flag: Flag, 'plus-circle': PlusCircle, 'log-in': LogIn };
export const Feather = Object.assign(function Feather({ name, size, color }: { name: keyof typeof icons; size: number; color: string }) {
  const Icon = icons[name]; return <Icon size={size} color={color} />;
}, { glyphMap: icons });
