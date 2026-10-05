import React, { type ReactNode } from 'react';
import { Bell } from 'lucide-react';
import { View } from './_native';
import type { CSSProperties } from 'react';

export const palette = { dark: { background: '#132B39', foreground: '#FFFDF9', card: '#1B394A', accent: '#F0AA5C', accentForeground: '#132B39', muted: '#234354', mutedForeground: '#B8C4C7', secondary: '#2A4A5C', border: '#3D5B68' } };
export type MyLeague = { membershipId: string; membershipStatus: string; role: string; league: { id: string; name: string; status: string; starts_at: string; ends_at: string } };
export type LeagueDashboard = { members: { id: string; status: string; points: number }[] };
const now = Date.now();
const leagues: MyLeague[] = [{ membershipId: 'sample-you', membershipStatus: 'active', role: 'host', league: { id: 'sample-devon', name: 'Devon Crew', status: 'active', starts_at: new Date(now - 3 * 86400000).toISOString(), ends_at: new Date(now + 4 * 86400000).toISOString() } }];
const dashboard: LeagueDashboard = { members: [{ id: 'sample-you', status: 'active', points: 7 }, { id: 'sample-tom', status: 'active', points: 14 }, { id: 'sample-jack', status: 'active', points: 10 }, { id: 'sample-ryan', status: 'active', points: 6 }, { id: 'sample-mike', status: 'active', points: 5 }, { id: 'sample-sam', status: 'active', points: 3 }] };
export const getMyLeagues = async () => leagues;
export const getLeagueDashboard = async (_id: string) => dashboard;
export function useQuery<T>(options: { queryKey: unknown[]; queryFn: () => Promise<T>; refetchInterval?: number; enabled?: boolean }) {
  const data = (options.queryKey[0] === 'my-leagues' ? leagues : dashboard) as T;
  return { data, isLoading: false, isError: false, refetch: async () => ({ data }) };
}
export const useQueryClient = () => ({ refetchQueries: async (_options: unknown) => {} });
export const router = { push: (_href: string) => {} };
export const useFocusEffect = (_callback: () => void) => {};
export const useSafeAreaInsets = () => ({ top: 0, bottom: 0, left: 0, right: 0 });
export const useColors = () => palette.dark;
export const uiStyles = { content: { paddingHorizontal: 20, paddingBottom: 40 } };
export function Card({ children, style }: { children?: ReactNode; style?: Record<string, unknown> }) { return <View style={{ backgroundColor: palette.dark.card, borderColor: palette.dark.border, borderWidth: 1, borderRadius: 24, padding: 18, ...style }}>{children}</View>; }
export function Screen({ children, style }: { children?: ReactNode; style?: CSSProperties }) { return <div style={{ minHeight: '100vh', ...style }}>{children}</div>; }
export function NotificationBell() { return <div style={{ display: 'grid', placeItems: 'center', width: 46, height: 46, border: '1px solid #3D5B68', borderRadius: 16 }}><Bell size={21} color="#FFFDF9" /></div>; }
