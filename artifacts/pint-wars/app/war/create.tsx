import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Purchases, { PURCHASES_ERROR_CODE } from 'react-native-purchases';
import { Button, Card, ErrorText, Field, Screen, Title, uiStyles } from '@/components/AppUi';
import {
  checkPaidLeaguePurchaseAvailability,
  createFreeLeague,
  createPaidLeague,
  getMyProfile,
} from '@/src/lib/league-service';
import { useAuth } from '@/src/providers/AuthProvider';
import {
  PINT_WAR_PRODUCTS,
  type PintWarProductIdentifier,
  useRevenueCat,
} from '@/src/providers/RevenueCatProvider';
import { useColors } from '@/hooks/useColors';

type LeaguePlan = {
  id: string;
  capacity: number;
  durationDays?: number;
  title: string;
  description: string;
  kind: 'free' | 'paid';
  productIdentifier?: PintWarProductIdentifier;
};

type PendingPaidPurchase = {
  productIdentifier: string;
  transactionIdentifier: string;
  durationDays: number;
};

type PaidLeagueCreation = PendingPaidPurchase & {
  selectedProductIdentifier: PintWarProductIdentifier;
};

const leaguePlans: LeaguePlan[] = [
  {
    id: 'free-4',
    capacity: 4,
    durationDays: 10,
    title: 'Free Pint War',
    description: 'One free trial per account, for 4 players over 10 days.',
    kind: 'free',
  },
  ...PINT_WAR_PRODUCTS.map(({ identifier, capacity }) => ({
    id: `paid-${capacity}`,
    capacity,
    title: `${capacity}-player Pint War`,
    description: `A one-time Pint War for up to ${capacity} players. Choose the duration separately.`,
    kind: 'paid' as const,
    productIdentifier: identifier,
  })),
];

export default function CreateWarScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const revenueCat = useRevenueCat();
  const client = useQueryClient();
  const paidAvailabilityQuery = useQuery({
    queryKey: ['paid-league-purchase-availability', user?.id],
    queryFn: checkPaidLeaguePurchaseAvailability,
    enabled: Boolean(user?.id),
    staleTime: 30_000,
    retry: 1,
  });
  const profileQuery = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getMyProfile(user?.id as string),
    enabled: Boolean(user?.id),
  });
  const [name, setName] = useState('');
  const [paidDurationInput, setPaidDurationInput] = useState('7');
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [isSetupStep, setIsSetupStep] = useState(false);
  const [error, setError] = useState('');
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [pendingPurchase, setPendingPurchase] =
    useState<PendingPaidPurchase | null>(null);
  const selectedPlan = leaguePlans.find((plan) => plan.id === selectedPlanId);
  const parsedPaidDurationDays = Number(paidDurationInput);
  const isPaidDurationValid =
    Number.isInteger(parsedPaidDurationDays) &&
    parsedPaidDurationDays >= 1 &&
    parsedPaidDurationDays <= 30;
  const summaryDurationDays =
    pendingPurchase?.durationDays ??
    (isPaidDurationValid ? parsedPaidDurationDays : null);
  const freeTrialUsed = profileQuery.data?.free_trial_used_at != null;
  const pendingPurchaseProduct = pendingPurchase
    ? PINT_WAR_PRODUCTS.find(
        (product) => product.identifier === pendingPurchase.productIdentifier,
      )
    : null;
  const pendingPurchaseMatchesSelectedPlan = Boolean(
    pendingPurchaseProduct &&
      selectedPlan?.productIdentifier === pendingPurchaseProduct.identifier,
  );
  const availableLeaguePlans = pendingPurchase
    ? pendingPurchaseProduct
      ? leaguePlans.filter(
          (plan) => plan.productIdentifier === pendingPurchaseProduct.identifier,
        )
      : []
    : freeTrialUsed
      ? leaguePlans.filter((plan) => plan.kind !== 'free')
      : leaguePlans;
  const selectedPackage = selectedPlan?.productIdentifier
    ? revenueCat.offering?.availablePackages.find(
        (item) => item.product.identifier === selectedPlan.productIdentifier,
      )
    : null;
  const configuredProductIdentifiers =
    revenueCat.offering?.availablePackages.map((item) => item.product.identifier) ?? [];
  const offeringHasExactlyLeagueProducts =
    configuredProductIdentifiers.length === PINT_WAR_PRODUCTS.length &&
    PINT_WAR_PRODUCTS.every((product) =>
      configuredProductIdentifiers.includes(product.identifier),
    );
  const paidCheckoutReady =
    revenueCat.isConfigured &&
    offeringHasExactlyLeagueProducts &&
    paidAvailabilityQuery.data === true;

  const finishLeagueCreation = async (result: { league_id: string; invite_code: string }) => {
    await client.invalidateQueries({ queryKey: ['my-leagues'] });
    router.replace({
      pathname: '/war/invite',
      params: { leagueId: result.league_id, code: result.invite_code },
    });
  };

  const mutation = useMutation({
    mutationFn: () => createFreeLeague(name),
    onSuccess: finishLeagueCreation,
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

  const paidMutation = useMutation({
    mutationFn: (purchase: PaidLeagueCreation) =>
      createPaidLeague(
        name,
        purchase.productIdentifier,
        purchase.selectedProductIdentifier,
        purchase.transactionIdentifier,
        purchase.durationDays,
      ),
    onSuccess: async (result) => {
      setPendingPurchase(null);
      await finishLeagueCreation(result);
    },
    onError: (cause) => {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Your paid Pint War could not be created.',
      );
    },
  });

  async function purchaseSelectedPlan() {
    const selectedProductIdentifier = selectedPlan?.productIdentifier;
    const packageToPurchase = selectedPackage;

    if (selectedPlan?.kind !== 'paid' || !selectedProductIdentifier) {
      setError('Choose a paid Pint War size before purchasing.');
      return;
    }
    if (!isPaidDurationValid) {
      setError('Choose a duration between 1 and 30 days before purchasing.');
      return;
    }
    if (
      !paidCheckoutReady ||
      !packageToPurchase ||
      packageToPurchase.product.identifier !== selectedProductIdentifier
    ) {
      setError('Payments are still being configured. You will not be charged.');
      return;
    }

    setError('');
    setIsPurchasing(true);
    try {
      const result = await Purchases.purchasePackage(packageToPurchase);
      const purchase: PendingPaidPurchase = {
        productIdentifier: result.productIdentifier,
        transactionIdentifier: result.transaction.transactionIdentifier,
        durationDays: parsedPaidDurationDays,
      };
      setPendingPurchase(purchase);
      void revenueCat.refresh().catch(() => undefined);

      if (result.productIdentifier !== selectedProductIdentifier) {
        return;
      }

      paidMutation.mutate({
        ...purchase,
        selectedProductIdentifier,
      });
    } catch (cause) {
      const purchaseError = cause as {
        code?: unknown;
        message?: unknown;
        userCancelled?: unknown;
      };
      if (
        purchaseError.userCancelled === true ||
        purchaseError.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
      ) {
        return;
      }
      setError(
        typeof purchaseError.message === 'string'
          ? purchaseError.message
          : 'The purchase could not be completed. You will not be charged.',
      );
    } finally {
      setIsPurchasing(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={[uiStyles.content, { paddingTop: 28, gap: 24 }]} keyboardShouldPersistTaps="handled">
        {isSetupStep && selectedPlan ? (
          <>
            <Title eyebrow={selectedPlan.kind === 'paid' ? 'Paid Pint War' : 'New competition'}>
              Confirm your Pint War
            </Title>
            <Card style={{ gap: 18 }}>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', lineHeight: 22 }}>
                {selectedPlan.kind === 'paid'
                  ? 'Checkout is limited to the size you selected. Review the capacity, price, and duration before confirming the store purchase.'
                  : 'Review your league details before creating your free Pint War.'}
              </Text>
              <View style={styles.summary}>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>League size</Text>
                  <Text style={[styles.summaryValue, { color: colors.foreground }]}>{selectedPlan.title}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Price</Text>
                  <Text style={[styles.summaryValue, { color: colors.foreground }]}>
                    {selectedPlan.kind === 'free'
                      ? 'Free'
                      : selectedPackage?.product.priceString ?? 'Unavailable'}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Duration</Text>
                  <Text style={[styles.summaryValue, { color: colors.foreground }]}>
                    {selectedPlan.kind === 'free'
                      ? `${selectedPlan.durationDays ?? 10} days`
                      : summaryDurationDays
                        ? `${summaryDurationDays} ${summaryDurationDays === 1 ? 'day' : 'days'}`
                        : 'Select 1–30 days'}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Players</Text>
                  <Text style={[styles.summaryValue, { color: colors.foreground }]}>{selectedPlan.capacity}</Text>
                </View>
              </View>
              {selectedPlan.kind === 'paid' ? (
                <View style={styles.durationField}>
                  <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Duration (days)</Text>
                  <TextInput
                    accessibilityLabel="Paid Pint War duration in days"
                    editable={!pendingPurchase && !isPurchasing && !paidMutation.isPending}
                    keyboardType="number-pad"
                    maxLength={2}
                    onChangeText={(value) => {
                      setPaidDurationInput(value.replace(/\D/g, '').slice(0, 2));
                      setError('');
                    }}
                    placeholder="7"
                    selectTextOnFocus
                    style={[
                      styles.durationInput,
                      {
                        backgroundColor: colors.background,
                        borderColor: colors.border,
                        color: colors.foreground,
                        opacity: pendingPurchase ? 0.6 : 1,
                      },
                    ]}
                    value={
                      pendingPurchase
                        ? String(pendingPurchase.durationDays)
                        : paidDurationInput
                    }
                  />
                  <Text style={[styles.durationHint, { color: colors.mutedForeground }]}>
                    Choose any duration from 1 to 30 days. Price depends only on player capacity.
                  </Text>
                  {!pendingPurchase && !isPaidDurationValid ? (
                    <ErrorText>Enter a whole number from 1 to 30 days.</ErrorText>
                  ) : null}
                </View>
              ) : null}
              <Field
                label="League name"
                value={name}
                onChangeText={setName}
                placeholder="Exmouth Pint Wars"
                maxLength={80}
                editable={!pendingPurchase && !isPurchasing && !paidMutation.isPending}
              />
              {error ? <ErrorText>{error}</ErrorText> : null}
              {selectedPlan.kind === 'paid' ? (
                <>
                  <Text style={[styles.paymentNote, { color: colors.mutedForeground }]}>
                    This is a one-time purchase for one {selectedPlan.capacity}-player Pint War. Price depends only on capacity; duration is selected separately and does not change the price.
                  </Text>
                  {revenueCat.status === 'loading' || paidAvailabilityQuery.isLoading ? (
                    <ActivityIndicator color={colors.accent} />
                  ) : null}
                  {revenueCat.error ? <ErrorText>{revenueCat.error}</ErrorText> : null}
                  {revenueCat.isConfigured && !offeringHasExactlyLeagueProducts ? (
                    <ErrorText>
                      The RevenueCat Default offering must contain exactly these four products: pint_war_6_players, pint_war_10_players, pint_war_14_players, and pint_war_16_players.
                    </ErrorText>
                  ) : null}
                  {paidAvailabilityQuery.isError ? (
                    <ErrorText>Could not check whether purchase verification is ready.</ErrorText>
                  ) : paidAvailabilityQuery.data === false ? (
                    <ErrorText>Purchase verification is not configured yet. You will not be charged.</ErrorText>
                  ) : null}
                  {paidMutation.isPending || isPurchasing ? (
                    <ActivityIndicator color={colors.accent} />
                  ) : null}
                  {pendingPurchase && pendingPurchaseProduct && !pendingPurchaseMatchesSelectedPlan ? (
                    <>
                      <ErrorText>
                        The store completed a {pendingPurchaseProduct.capacity}-player purchase, but this Pint War is set to {selectedPlan.capacity} players. No Pint War was created. Switch to the purchased size to retry without paying again.
                      </ErrorText>
                      <Button
                        label={`Use purchased ${pendingPurchaseProduct.capacity}-player size`}
                        variant="secondary"
                        onPress={() => {
                          setSelectedPlanId(`paid-${pendingPurchaseProduct.capacity}`);
                          setError('');
                        }}
                        disabled={isPurchasing || paidMutation.isPending}
                      />
                    </>
                  ) : pendingPurchase && !pendingPurchaseProduct ? (
                    <ErrorText>
                      RevenueCat confirmed a product that is not one of the supported Pint War sizes. No Pint War was created. Do not purchase again; contact support before continuing.
                    </ErrorText>
                  ) : pendingPurchase && pendingPurchaseMatchesSelectedPlan ? (
                    <Button
                      label={`Retry verification and create ${selectedPlan.capacity}-player Pint War`}
                      onPress={() => {
                        if (!selectedPlan.productIdentifier) return;
                        setError('');
                        paidMutation.mutate({
                          ...pendingPurchase,
                          selectedProductIdentifier: selectedPlan.productIdentifier,
                        });
                      }}
                      loading={paidMutation.isPending}
                      disabled={!name.trim() || paidMutation.isPending || isPurchasing}
                    />
                  ) : (
                    <Button
                      label={`Purchase ${selectedPlan.capacity}-player Pint War`}
                      onPress={() => void purchaseSelectedPlan()}
                      loading={isPurchasing}
                      disabled={!name.trim() || !isPaidDurationValid || !paidCheckoutReady || paidMutation.isPending || isPurchasing}
                    />
                  )}
                </>
              ) : profileQuery.isLoading ? (
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
              <Button
                label="Change league size"
                variant="quiet"
                disabled={isPurchasing || paidMutation.isPending}
                onPress={() => {
                  setIsSetupStep(false);
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
                {'Choose your league size and duration.\nPaid Pint Wars can run for 1–30 days.'}
              </Text>
              {pendingPurchase && pendingPurchaseProduct ? (
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', lineHeight: 21 }}>
                  A purchase for {pendingPurchaseProduct.capacity} players is awaiting verification. Select that size to continue without paying again.
                </Text>
              ) : null}
              {pendingPurchase && !pendingPurchaseProduct ? (
                <ErrorText>
                  A completed store purchase could not be matched to a supported size. No Pint War was created. Do not purchase again; contact support.
                </ErrorText>
              ) : null}
              <View style={styles.planList}>
                <Text style={[styles.sectionLabel, { color: colors.foreground }]}>League size</Text>
                {availableLeaguePlans.map((plan) => {
                  const isSelected = plan.id === selectedPlanId;
                  const planPackage = plan.productIdentifier
                    ? revenueCat.offering?.availablePackages.find(
                        (item) => item.product.identifier === plan.productIdentifier,
                      )
                    : undefined;
                  return (
                    <Pressable
                      key={plan.id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => {
                        setSelectedPlanId(plan.id);
                        setIsSetupStep(true);
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
                            <Text style={[styles.comingSoon, { color: colors.accent }]}>ONE-TIME</Text>
                          ) : null}
                        </View>
                        <Text style={[styles.planDescription, { color: colors.mutedForeground }]}>{plan.description}</Text>
                      </View>
                      <View style={styles.planMeta}>
                        <Text style={[styles.planPrice, { color: colors.foreground }]}>
                          {plan.kind === 'free'
                            ? 'Free'
                            : planPackage?.product.priceString ??
                              (revenueCat.status === 'loading' ? '…' : '—')}
                        </Text>
                        <Text style={[styles.planPlayers, { color: colors.mutedForeground }]}>{plan.capacity} players</Text>
                      </View>
                    </Pressable>
                  );
                })}
               </View>
             </Card>
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
  durationField: { gap: 8 },
  durationInput: { width: 96, height: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontFamily: 'Inter_600SemiBold', fontSize: 16, textAlign: 'center' },
  durationHint: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 },
  paymentNote: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19 },
  trialCard: { gap: 8 },
  trialTitle: { fontFamily: 'Inter_700Bold', fontSize: 17 },
});