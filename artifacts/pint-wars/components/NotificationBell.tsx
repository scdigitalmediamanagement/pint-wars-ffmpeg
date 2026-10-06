import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { getUnreadNotificationCount } from '@/src/lib/league-service';
import { useAuth } from '@/src/providers/AuthProvider';

type BellAppearance = Pick<ReturnType<typeof useColors>, 'foreground' | 'border' | 'accent' | 'accentForeground'>;

export function NotificationBell({ appearance, compact = false }: { appearance?: BellAppearance; compact?: boolean } = {}) {
  const deviceColors = useColors();
  const colors = appearance ?? deviceColors;
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: getUnreadNotificationCount,
    enabled: Boolean(user?.id),
    refetchInterval: 30_000,
  });
  const unreadCount = query.data ?? 0;

  return (
    <Pressable
      accessibilityLabel={unreadCount ? `${unreadCount} unread notifications` : 'Notifications'}
      accessibilityRole="button"
      onPress={() => router.push('/notifications')}
      style={({ pressed }) => [styles.button, compact && styles.compactButton, { borderColor: colors.border, opacity: pressed ? 0.72 : 1 }]}
    >
      <Feather name="bell" size={21} color={colors.foreground} />
      {unreadCount > 0 ? (
        <View style={[styles.badge, { backgroundColor: colors.accent }]}>
          <Text style={[styles.badgeText, { color: colors.accentForeground }]}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  compactButton: { width: 38, height: 38, borderRadius: 19 },
  button: {
    width: 46,
    height: 46,
    borderWidth: 1,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 19,
    height: 19,
    paddingHorizontal: 4,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: 'Inter_700Bold', fontSize: 10 },
});