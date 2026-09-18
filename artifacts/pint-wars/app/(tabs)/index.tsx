import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, Screen, Title, uiStyles } from '@/components/AppUi';
import { NotificationBell } from '@/components/NotificationBell';
import { getMyLeagues } from '@/src/lib/league-service';
import { useColors } from '@/hooks/useColors';

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const query = useQuery({ queryKey: ['my-leagues'], queryFn: getMyLeagues });
  const activeLeague = query.data?.find((item) => item.league.status === 'active' && item.membershipStatus === 'active');

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[
          uiStyles.content,
          { paddingTop: Math.max(22, insets.top + 8), gap: 22 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View style={styles.greeting}>
            <Text style={[styles.kicker, { color: colors.accent }]}>WEDNESDAY NIGHT PLANS</Text>
            <Title>Ready to make it count?</Title>
          </View>
          <NotificationBell />
        </View>
        {query.isLoading ? <ActivityIndicator color={colors.accent} /> : null}
        {query.isError ? <Text style={{ color: colors.destructive }}>Could not load your wars. Pull to try again.</Text> : null}
        {activeLeague ? (
          <Pressable onPress={() => router.push(`/war/${activeLeague.league.id}`)} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
            <Card style={{ gap: 15 }}>
              <View style={uiStyles.row}>
                <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>ACTIVE PINT WAR</Text>
                <Text style={[styles.status, { color: colors.accent }]}>LIVE</Text>
              </View>
              <Text style={[styles.leagueName, { color: colors.foreground }]}>{activeLeague.league.name}</Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>Tap to see the leaderboard and your war progress.</Text>
            </Card>
          </Pressable>
        ) : (
          <Card style={{ gap: 14 }}>
            <Text style={[styles.leagueName, { color: colors.foreground }]}>No active war yet</Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', lineHeight: 21 }}>
              Start a free 4-player trial or join a Pint War with an invite code.
            </Text>
            <View style={{ gap: 10 }}>
              <Button label="Create a Pint War" onPress={() => router.push('/war/create')} />
              <Button label="Join with a code" variant="secondary" onPress={() => router.push('/war/join')} />
            </View>
          </Card>
        )}
        <View style={{ gap: 10 }}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Your Pint Wars toolkit</Text>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', lineHeight: 22 }}>
            Log pints with photo proof and location, discover nearby pubs, and keep your Passport, reviews, and league progress together.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  greeting: { gap: 3 },
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 1.5 },
  cardLabel: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 1.2 },
  status: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 1.2 },
  leagueName: { fontFamily: 'Inter_700Bold', fontSize: 24 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 20 },
});