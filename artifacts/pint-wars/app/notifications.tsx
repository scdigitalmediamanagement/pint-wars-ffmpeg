import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, ErrorText, Screen, uiStyles } from '@/components/AppUi';
import {
  getMyNotifications,
  markNotificationRead,
  type AppNotification,
} from '@/src/lib/league-service';
import { useColors } from '@/hooks/useColors';

function formatNotificationTime(createdAt: string) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function NotificationsScreen() {
  const colors = useColors();
  const client = useQueryClient();
  const [error, setError] = useState('');
  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: getMyNotifications,
    refetchInterval: 30_000,
  });

  async function openNotification(notification: AppNotification) {
    setError('');
    if (!notification.read_at) {
      try {
        await markNotificationRead(notification.id);
        client.setQueryData<AppNotification[]>(['notifications'], (current) =>
          current?.map((item) =>
            item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item,
          ),
        );
        client.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      } catch (markError) {
        setError(markError instanceof Error ? markError.message : 'Could not mark the notification as read.');
        return;
      }
    }

    if (notification.league_id) {
      router.push(`/war/${notification.league_id}`);
    }
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[uiStyles.content, { paddingTop: 22, gap: 18 }]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Feather name="arrow-left" size={20} color={colors.foreground} />
          <Text style={[styles.backText, { color: colors.foreground }]}>Back</Text>
        </Pressable>
        <View style={styles.heading}>
          <Text style={[styles.kicker, { color: colors.accent }]}>YOUR ACTIVITY</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Notifications</Text>
        </View>
        {query.isLoading ? <ActivityIndicator color={colors.accent} /> : null}
        {query.isError ? (
          <Text style={{ color: colors.destructive }}>
            {query.error instanceof Error ? query.error.message : 'Could not load notifications.'}
          </Text>
        ) : null}
        {error ? <ErrorText>{error}</ErrorText> : null}
        {!query.isLoading && !query.isError && !query.data?.length ? (
          <Card style={styles.emptyCard}>
            <Feather name="bell-off" size={28} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>You’re all caught up</Text>
            <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
              New Pint War activity will appear here.
            </Text>
          </Card>
        ) : null}
        {query.data?.map((notification) => {
          const isUnread = !notification.read_at;
          return (
            <Pressable
              key={notification.id}
              accessibilityRole="button"
              accessibilityState={{ selected: isUnread }}
              onPress={() => void openNotification(notification)}
              style={({ pressed }) => ({ opacity: pressed ? 0.78 : 1 })}
            >
              <Card style={[styles.notificationCard, isUnread ? { borderColor: colors.accent } : null]}>
                <View style={styles.notificationHeader}>
                  <View style={styles.notificationTitleRow}>
                    {isUnread ? <View style={[styles.unreadDot, { backgroundColor: colors.accent }]} /> : null}
                    <Text style={[styles.notificationTitle, { color: colors.foreground }]}>{notification.title}</Text>
                  </View>
                  <Text style={[styles.state, { color: isUnread ? colors.accent : colors.mutedForeground }]}>
                    {isUnread ? 'UNREAD' : 'READ'}
                  </Text>
                </View>
                <Text style={[styles.notificationBody, { color: colors.mutedForeground }]}>{notification.body}</Text>
                <View style={styles.notificationFooter}>
                  <Text style={[styles.time, { color: colors.mutedForeground }]}>
                    {formatNotificationTime(notification.created_at)}
                  </Text>
                  <Text style={[styles.action, { color: colors.primary }]}>
                    {notification.league_id ? 'Open Pint War' : isUnread ? 'Mark read' : ''}
                  </Text>
                </View>
              </Card>
            </Pressable>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  backText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  heading: { gap: 5, marginBottom: 4 },
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 1.5 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 32, lineHeight: 38 },
  emptyCard: { alignItems: 'center', gap: 10, paddingVertical: 30 },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 20 },
  emptyBody: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, textAlign: 'center' },
  notificationCard: { gap: 12 },
  notificationHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  notificationTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  notificationTitle: { flex: 1, fontFamily: 'Inter_700Bold', fontSize: 17 },
  state: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1 },
  notificationBody: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21 },
  notificationFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  time: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12 },
  action: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
});