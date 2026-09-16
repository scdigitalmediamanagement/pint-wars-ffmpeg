import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Screen, Title, uiStyles } from '@/components/AppUi';
import { getMyLeagues } from '@/src/lib/league-service';
import { useColors } from '@/hooks/useColors';

export default function WarsScreen() {
  const colors = useColors();
  const query = useQuery({ queryKey: ['my-leagues'], queryFn: getMyLeagues });

  return (
    <Screen>
      <ScrollView contentContainerStyle={[uiStyles.content, { paddingTop: 22, gap: 22 }]} showsVerticalScrollIndicator={false}>
        <Title eyebrow="Your competitions">Pint Wars</Title>
        <Button label="Create a free 8-player war" onPress={() => router.push('/war/create')} />
        <Button label="Join a war" variant="secondary" onPress={() => router.push('/war/join')} />
        {query.isLoading ? <ActivityIndicator color={colors.accent} /> : null}
        {query.isError ? <Text style={{ color: colors.destructive }}>Could not load your wars.</Text> : null}
        {query.data?.map((item) => (
          <Pressable key={item.membershipId} onPress={() => router.push(`/war/${item.league.id}`)} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
            <Card style={styles.warCard}>
              <View style={uiStyles.row}>
                <Text style={[styles.status, { color: item.league.status === 'active' ? colors.accent : colors.mutedForeground }]}>
                  {item.league.status === 'active' ? 'ACTIVE' : 'COMPLETE'}
                </Text>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }}>{item.role === 'host' ? 'Host' : 'Player'}</Text>
              </View>
              <Text style={[styles.name, { color: colors.foreground }]}>{item.league.name}</Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>8-player free league</Text>
            </Card>
          </Pressable>
        ))}
        {!query.isLoading && !query.data?.length ? (
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', lineHeight: 22 }}>
            Your completed and active wars will show here.
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  warCard: { gap: 12 },
  status: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 1.3 },
  name: { fontFamily: 'Inter_700Bold', fontSize: 22 },
});