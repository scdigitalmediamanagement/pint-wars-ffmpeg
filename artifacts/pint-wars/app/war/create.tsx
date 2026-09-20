import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, ErrorText, Field, Screen, Title, uiStyles } from '@/components/AppUi';
import { createFreeLeague, getMyProfile } from '@/src/lib/league-service';
import { useAuth } from '@/src/providers/AuthProvider';
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
    id: 'free-4',
    capacity: 4,
    price: 'Free',
    title: 'Free Pint War',
    description: 'One free trial per account, for 4 players over 10 days.',
    kind: 'free',
  },
  {
    id: 'paid-6',
    capacity: 6,
    price: '£2.99',
    title: '6-player Pint War',
    description: 'A 10-day Pint War for a small group.',
    kind: 'paid',
  },
  {
    id: 'paid-10',
    capacity: 10,
    price: '£3.99',
    title: '10-player Pint War',
    description: 'A 10-day Pint War with room for more mates.',
    kind: 'paid',
  },
  {
    id: 'paid-14',
    capacity: 14,
    price: '£4.99',
    title: '14-player Pint War',
    description: 'Room for a large crew of friends.',
    kind: 'paid',
  },
  {
    id: 'paid-16',
    capacity: 16,
    price: '£5.99',
    title: '16-player Pint War',
    description: 'The biggest Pint War option.',
    kind: 'paid',
  },
];

export default function CreateWarScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const client = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getMyProfile(user?.id as string),
    enabled: Boolean(user?.id),
  });
  const [name, setName] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('free-4');
  const [isPaidConfirmation, setIsPaidConfirmation] = useState(false);
  const [error, setError] = useState('');
  const selectedPlan = leaguePlans.find((plan) => plan.id === selectedPlanId) ?? leaguePlans[0];
  const freeTrialUsed = profileQuery.data?.free_trial_used_at != null;

  useEffect(() => {
    Keyboard.dismiss();
  }, []);

  useFocusEffect(
    useCallback(() => {
      Keyboard.dismiss();
    }, []),
  );

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
        {isPaidConfirmation && selectedPlan.kind === 'paid' ? (
          <>
            <Title eyebrow="Payment-ready preview">Confirm your Pint War</Title>
            <Card style={{ gap: 18 }}>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', lineHeight: 22 }}>
                Review your league details. Payments are not enabled yet, so nothing will be charged or created.
              </Text>
              <View style={styles.summary}>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>League size</Text>
                  <Text style={[styles.summaryValue, { color: colors.foreground }]}>{selectedPlan.title}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Price</Text>
                  <Text style={[styles.summaryValue, { color: colors.foreground }]}>{selectedPlan.price}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Duration</Text>
                  <Text style={[styles.summaryValue, { color: colors.foreground }]}>10 days</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Players</Text>
                  <Text style={[styles.summaryValue, { color: colors.foreground }]}>{selectedPlan.capacity}</Text>
                </View>
              </View>
              <Field label="League name" value={name} onChangeText={setName} placeholder="Exmouth Pint Wars" maxLength={80} />
              <Text style={[styles.paymentNote, { color: colors.mutedForeground }]}>
                This option will create a 10-day Pint War for {selectedPlan.capacity} players after payment is added.
              </Text>
              {error ? <ErrorText>{error}</ErrorText> : null}
              <Button
                label="Payments coming soon"
                onPress={() => undefined}
                disabled
              />
              <Button
                label="Change league size"
                variant="quiet"
                onPress={() => {
                  setIsPaidConfirmation(false);
                  setError('');
                }}
              />
            </Card>
          </>
        ) : (
          <>
            <Title eyebrow="New competition">Create a Pint War</Title>
            <Card style={{ gap: 16 }}>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', lineHeight: 22 }}>
                Choose your league size. Every Pint War starts as soon as it is created and runs for 10 days.
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
                        setIsPaidConfirmation(plan.kind === 'paid');
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
                          ) : freeTrialUsed ? (
                            <Text style={[styles.comingSoon, { color: colors.mutedForeground }]}>USED</Text>
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
              <Field label="League name" value={name} onChangeText={setName} placeholder="Exmouth Pint Wars" maxLength={80} />
              {error ? <ErrorText>{error}</ErrorText> : null}
              {profileQuery.isLoading ? (
                <ActivityIndicator color={colors.accent} />
              ) : profileQuery.isError ? (
                <ErrorText>Could not check your free-trial entitlement.</ErrorText>
              ) : freeTrialUsed ? (
                <Card style={styles.trialCard}>
                  <Text style={[styles.trialTitle, { color: colors.foreground }]}>Free trial already used</Text>
                  <Text style={[styles.paymentNote, { color: colors.mutedForeground }]}>
                    Each account gets one 4-player, 10-day trial. You can still join paid Pint Wars when they are available.
                  </Text>
                </Card>
              ) : (
                <Button
                  label="Create your free 4-player trial"
                  onPress={() => mutation.mutate()}
                  loading={mutation.isPending}
                  disabled={!name.trim() || profileQuery.isLoading || profileQuery.isError}
                />
              )}
            </Card>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', lineHeight: 21 }}>
              Each account gets one free 4-player, 10-day trial. Paid league sizes will be available after payments are added.
            </Text>
          </>
        )}
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
  summary: { gap: 12, paddingVertical: 2 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  summaryLabel: { fontFamily: 'Inter_400Regular', fontSize: 14 },
  summaryValue: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 14, textAlign: 'right' },
  paymentNote: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19 },
  trialCard: { gap: 8 },
  trialTitle: { fontFamily: 'Inter_700Bold', fontSize: 17 },
});