import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, ErrorText, Field, Screen, Title, uiStyles } from '@/components/AppUi';
import { createFreeLeague } from '@/src/lib/league-service';
import { useColors } from '@/hooks/useColors';

type LeaguePlan = {
  id: string;
  capacity: number;
  price: string;
  title: string;
  description: string;
  kind: 'free' | 'paid';
};

const leaguePlans: LeaguePlan[] = [
  {
    id: 'free-8',
    capacity: 8,
    price: 'Free',
    title: 'Free Pint War',
    description: 'Your one free league for up to 8 players.',
    kind: 'free',
  },
  {
    id: 'paid-8',
    capacity: 8,
    price: '£2.99',
    title: '8-player Pint War',
    description: 'A paid league for a second group or another 30-day war.',
    kind: 'paid',
  },
  {
    id: 'paid-12',
    capacity: 12,
    price: '£3.99',
    title: '12-player Pint War',
    description: 'Bring a bigger group into the competition.',
    kind: 'paid',
  },
  {
    id: 'paid-16',
    capacity: 16,
    price: '£4.99',
    title: '16-player Pint War',
    description: 'Room for a large crew of friends.',
    kind: 'paid',
  },
  {
    id: 'paid-20',
    capacity: 20,
    price: '£5.99',
    title: '20-player Pint War',
    description: 'The biggest Pint War option.',
    kind: 'paid',
  },
];

export default function CreateWarScreen() {
  const colors = useColors();
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('free-8');
  const [error, setError] = useState('');
  const selectedPlan = leaguePlans.find((plan) => plan.id === selectedPlanId) ?? leaguePlans[0];
  const mutation = useMutation({
    mutationFn: () => createFreeLeague(name),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ['my-leagues'] });
      router.replace({ pathname: '/war/invite', params: { leagueId: result.league_id, code: result.invite_code } });
    },
    onError: (err) => {
      if (__DEV__) {
        console.error('[Pint Wars] create screen error', err);
      }
      if (err instanceof Error) {
        setError(err.message);
        return;
      }
      const errorRecord = err as { message?: unknown };
      if (typeof errorRecord.message === 'string') {
        setError(errorRecord.message);
        return;
      }
      setError('Could not create your war.');
    },
  });

  return (
    <Screen>
      <ScrollView contentContainerStyle={[uiStyles.content, { paddingTop: 28, gap: 24 }]} keyboardShouldPersistTaps="handled">
        <Title eyebrow="New competition">Create a Pint War</Title>
        <Card style={{ gap: 16 }}>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', lineHeight: 22 }}>
            Choose your league size. Every Pint War starts as soon as it is created and runs for 30 days.
          </Text>
          <View style={styles.planList}>
            <Text style={[styles.sectionLabel, { color: colors.foreground }]}>League size</Text>
            {leaguePlans.map((plan) => {
              const isSelected = plan.id === selectedPlan.id;
              return (
                <Pressable
                  key={plan.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => {
                    setSelectedPlanId(plan.id);
                    setError('');
                  }}
                  style={({ pressed }) => [
                    styles.plan,
                    {
                      backgroundColor: colors.background,
                      borderColor: isSelected ? colors.accent : colors.border,
                      opacity: pressed ? 0.78 : 1,
                    },
                  ]}
                >
                  <View style={styles.planCopy}>
                    <View style={styles.planTitleRow}>
                      <Text style={[styles.planTitle, { color: colors.foreground }]}>{plan.title}</Text>
                      {plan.kind === 'paid' ? (
                        <Text style={[styles.comingSoon, { color: colors.accent }]}>COMING SOON</Text>
                      ) : null}
                    </View>
                    <Text style={[styles.planDescription, { color: colors.mutedForeground }]}>{plan.description}</Text>
                  </View>
                  <View style={styles.planMeta}>
                    <Text style={[styles.planPrice, { color: colors.foreground }]}>{plan.price}</Text>
                    <Text style={[styles.planPlayers, { color: colors.mutedForeground }]}>{plan.capacity} players</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Field label="League name" value={name} onChangeText={setName} placeholder="Exmouth Pint Wars" maxLength={80} autoFocus />
          {selectedPlan.kind === 'paid' ? (
            <Text style={[styles.paymentNote, { color: colors.mutedForeground }]}>
              Payments are not enabled yet. Choose the free 8-player league to create a Pint War today.
            </Text>
          ) : null}
          {error ? <ErrorText>{error}</ErrorText> : null}
          <Button
            label={selectedPlan.kind === 'free' ? 'Create free war' : 'Payments coming soon'}
            onPress={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!name.trim() || selectedPlan.kind !== 'free'}
          />
        </Card>
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', lineHeight: 21 }}>
          Your account includes one free 8-player Pint War. Paid league sizes will be available after Apple and Google in-app purchases are added.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  planList: { gap: 10 },
  sectionLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  plan: { minHeight: 82, borderWidth: 1.5, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  planCopy: { flex: 1, gap: 5 },
  planTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  planTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  comingSoon: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.8 },
  planDescription: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17 },
  planMeta: { alignItems: 'flex-end', gap: 3 },
  planPrice: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  planPlayers: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  paymentNote: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19 },
});