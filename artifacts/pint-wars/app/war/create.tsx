import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Purchases, { PURCHASES_ERROR_CODE } from 'react-native-purchases';
import { useFonts } from 'expo-font';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, ErrorText, Screen, uiStyles } from '@/components/AppUi';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import home from '@/constants/homeColors';
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
  priceString: string;
};

type PaidLeagueCreation = PendingPaidPurchase & {
  selectedProductIdentifier: PintWarProductIdentifier;
};

const leaguePlans: LeaguePlan[] = [
  ...PINT_WAR_PRODUCTS.map(({ identifier, capacity }) => ({
    id: `paid-${capacity}`,
    capacity,
    title: `${capacity}-player Pint War`,
    description: `A one-time Pint War for up to ${capacity} players. Choose the duration separately.`,
    kind: 'paid' as const,
    productIdentifier: identifier,
  })),
  {
    id: 'free-4',
    capacity: 4,
    durationDays: 10,
    title: 'Free Pint War',
    description: 'One free trial per account, for 4 players over 10 days.',
    kind: 'free',
  },
];

export default function CreateWarScreen() {
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({
    WarsDM_500: require('@/assets/fonts/wars/DMSans_500Medium.ttf'),
    WarsDM_700: require('@/assets/fonts/wars/DMSans_700Bold.ttf'),
    WarsSpace_600: require('@/assets/fonts/wars/SpaceGrotesk_600SemiBold.ttf'),
  });
  const styles = useMemo(() => createCreateWarStyles(fontsLoaded), [fontsLoaded]);
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
  const [isConfirmStep, setIsConfirmStep] = useState(false);
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
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  const finishLeagueCreation = async (
    result: { league_id: string; invite_code: string },
    purchasePrice?: string,
  ) => {
    await client.invalidateQueries({ queryKey: ['my-leagues'] });
    router.replace({
      pathname: '/war/invite',
      params: {
        leagueId: result.league_id,
        code: result.invite_code,
        ...(purchasePrice ? { purchasePrice } : {}),
      },
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
    onSuccess: async (result, purchase) => {
      setPendingPurchase(null);
      await finishLeagueCreation(result, purchase.priceString);
    },
    onError: (cause) => {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Your paid Pint War could not be created.',
      );
    },
  });

  const selectedPlanIsAvailable = Boolean(
    selectedPlan &&
      availableLeaguePlans.some((plan) => plan.id === selectedPlan.id),
  );
  const isBusy =
    isPurchasing || paidMutation.isPending || mutation.isPending;
  const canContinue = Boolean(
    selectedPlan &&
      selectedPlanIsAvailable &&
      name.trim() &&
      (selectedPlan.kind === 'free' || isPaidDurationValid) &&
      !isBusy,
  );
  const confirmedPrice =
    selectedPlan?.kind === 'free'
      ? 'Free'
      : selectedPlan?.kind === 'paid'
        ? pendingPurchaseMatchesSelectedPlan && pendingPurchase
          ? pendingPurchase.priceString
          : selectedPackage?.product.priceString ??
            (revenueCat.status === 'loading' ? 'Loading' : 'Unavailable')
        : 'Unavailable';
  const confirmedDurationDays =
    selectedPlan?.kind === 'free'
      ? selectedPlan.durationDays ?? 10
      : summaryDurationDays;

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
      const purchasedPackage = revenueCat.offering?.availablePackages.find(
        (item) => item.product.identifier === result.productIdentifier,
      );
      const purchase: PendingPaidPurchase = {
        productIdentifier: result.productIdentifier,
        transactionIdentifier: result.transaction.transactionIdentifier,
        durationDays: parsedPaidDurationDays,
        priceString:
          purchasedPackage?.product.priceString ??
          packageToPurchase.product.priceString,
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

  const showCreateScreen = !isConfirmStep || !selectedPlan;
  const displayDuration = String(
    pendingPurchase?.durationDays ?? paidDurationInput,
  );
  const isPlanBusy = Boolean(pendingPurchase || isBusy);

  return (
    <Screen style={styles.screen}>
      <KeyboardAwareScrollViewCompat
        style={styles.scroll}
        contentContainerStyle={[
          uiStyles.content,
          styles.scrollContent,
          {
            paddingTop: topInset + 8,
            paddingBottom: Math.max(bottomInset, 14) + 12,
          },
        ]}
        bottomOffset={88}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.page}>
          <View style={styles.header}>
            <Pressable
              testID="pint-war-flow-back"
              accessibilityRole="button"
              accessibilityLabel={isConfirmStep ? 'Edit Pint War details' : 'Back'}
              accessibilityState={{ disabled: isBusy }}
              disabled={isBusy}
              onPress={() => {
                if (isConfirmStep) {
                  setIsConfirmStep(false);
                  setError('');
                } else {
                  router.back();
                }
              }}
              style={({ pressed }) => [
                styles.backButton,
                { opacity: isBusy ? 0.45 : pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="arrow-left" size={18} color={home.text} />
            </Pressable>
            <View style={styles.brand} accessibilityLabel="Pint Wars">
              <Image
                source={require('@/assets/images/home/pw-reference-crest.png')}
                style={styles.crest}
                resizeMode="contain"
                accessible={false}
              />
              <Image
                source={require('@/assets/images/home/pw-reference-wordmark.png')}
                style={styles.wordmark}
                resizeMode="contain"
                accessibilityLabel="Pint Wars"
              />
            </View>
            <View style={styles.headerSpacer} />
          </View>

          <View style={styles.heading}>
            <Text style={styles.eyebrow}>
              {showCreateScreen
                ? 'NEW COMPETITION'
                : selectedPlan.kind === 'paid'
                  ? 'READY FOR THE OFF'
                  : 'FREE PINT WAR'}
            </Text>
            <Text style={styles.title}>
              {showCreateScreen
                ? 'Create a Pint War'
                : 'Confirm your Pint War'}
            </Text>
            <Text style={styles.description}>
              {showCreateScreen
                ? 'Set up the competition, then invite your friends to join the crew.'
                : 'One last look at the details. Get your crew together and make it a night to remember.'}
            </Text>
          </View>

          {showCreateScreen ? (
            <View style={styles.form}>
              <View style={styles.section}>
                <View style={styles.sectionHeading}>
                  <Text style={styles.sectionLabel}>LEAGUE NAME</Text>
                  <Text style={styles.sectionMeta}>GIVE YOUR CREW A NAME</Text>
                </View>
                <View style={styles.nameInputShell}>
                  <View style={styles.nameIcon}>
                    <Feather name="shield" size={16} color={home.gold} />
                  </View>
                  <TextInput
                    accessibilityLabel="League name"
                    testID="pint-war-name-input"
                    value={name}
                    onChangeText={(value) => {
                      setName(value);
                      setError('');
                    }}
                    placeholder="Devon Crew"
                    placeholderTextColor={home.muted}
                    maxLength={80}
                    editable={!isPlanBusy}
                    autoCapitalize="words"
                    returnKeyType="done"
                    style={styles.nameInput}
                  />
                  <Text style={styles.characterCount}>{name.length} / 80</Text>
                </View>
              </View>

              <View style={styles.section}>
                <View style={styles.sectionHeading}>
                  <Text style={styles.sectionLabel}>PLAYER CAPACITY</Text>
                  <Text style={styles.sectionMeta}>ONE-TIME PRICE</Text>
                </View>
                <View
                  style={styles.planList}
                  accessibilityRole="radiogroup"
                  accessibilityLabel="Pint War player capacity"
                >
                  {availableLeaguePlans.map((plan) => {
                    const isSelected = plan.id === selectedPlanId;
                    const planPackage = plan.productIdentifier
                      ? revenueCat.offering?.availablePackages.find(
                          (item) =>
                            item.product.identifier === plan.productIdentifier,
                        )
                      : undefined;
                    const planPrice =
                      plan.kind === 'free'
                        ? 'Free'
                        : planPackage?.product.priceString ??
                          (revenueCat.status === 'loading' ? '…' : '—');

                    return (
                      <PlanChoice
                        key={plan.id}
                        plan={plan}
                        selected={isSelected}
                        price={planPrice}
                        styles={styles}
                        onPress={() => {
                          setSelectedPlanId(plan.id);
                          setError('');
                        }}
                      />
                    );
                  })}
                </View>

                {pendingPurchase && pendingPurchaseProduct ? (
                  <View style={styles.notice}>
                    <Text style={styles.noticeText}>
                      A purchase for {pendingPurchaseProduct.capacity} players
                      is awaiting verification. Select that size to retry
                      without paying again.
                    </Text>
                  </View>
                ) : null}
                {pendingPurchase && !pendingPurchaseProduct ? (
                  <ErrorText>
                    A completed store purchase could not be matched to a
                    supported size. No Pint War was created. Do not purchase
                    again; contact support.
                  </ErrorText>
                ) : null}
                {freeTrialUsed ? (
                  <View style={styles.notice}>
                    <Text style={styles.noticeTitle}>Free trial already used</Text>
                    <Text style={styles.noticeText}>
                      Each account gets one 4-player, 10-day trial. Paid Pint
                      Wars are still available.
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.section}>
                <View style={styles.durationHeading}>
                  <View>
                    <Text style={styles.sectionLabel}>DURATION</Text>
                    <Text style={styles.durationRange}>
                      {selectedPlan?.kind === 'free'
                        ? 'Fixed for the free trial'
                        : 'Choose from 1 to 30 days'}
                    </Text>
                  </View>
                  {selectedPlan?.kind === 'free' ? (
                    <View style={[styles.durationControl, styles.fixedDuration]}>
                      <Text style={styles.durationValue}>10</Text>
                      <Text style={styles.durationUnit}>days</Text>
                      <Text style={styles.fixedLabel}>FIXED</Text>
                    </View>
                  ) : (
                    <View style={styles.durationControl}>
                      <Pressable
                        testID="pint-war-duration-decrease"
                        accessibilityRole="button"
                        accessibilityLabel="Decrease duration"
                        accessibilityState={{
                          disabled:
                            isPlanBusy ||
                            !isPaidDurationValid ||
                            parsedPaidDurationDays <= 1,
                        }}
                        disabled={
                          isPlanBusy ||
                          !isPaidDurationValid ||
                          parsedPaidDurationDays <= 1
                        }
                        onPress={() => {
                          setPaidDurationInput(
                            String(parsedPaidDurationDays - 1),
                          );
                          setError('');
                        }}
                        style={({ pressed }) => [
                          styles.stepper,
                          { opacity: pressed ? 0.65 : 1 },
                        ]}
                      >
                        <Feather name="minus" size={14} color={home.text} />
                      </Pressable>
                      <TextInput
                        accessibilityLabel="Paid Pint War duration in days"
                        testID="pint-war-duration-input"
                        editable={!isPlanBusy}
                        keyboardType="number-pad"
                        maxLength={2}
                        onChangeText={(value) => {
                          setPaidDurationInput(
                            value.replace(/\D/g, '').slice(0, 2),
                          );
                          setError('');
                        }}
                        selectTextOnFocus
                        style={styles.durationInput}
                        value={displayDuration}
                      />
                      <Text style={styles.durationUnit}>days</Text>
                      <Pressable
                        testID="pint-war-duration-increase"
                        accessibilityRole="button"
                        accessibilityLabel="Increase duration"
                        accessibilityState={{
                          disabled:
                            isPlanBusy ||
                            !isPaidDurationValid ||
                            parsedPaidDurationDays >= 30,
                        }}
                        disabled={
                          isPlanBusy ||
                          !isPaidDurationValid ||
                          parsedPaidDurationDays >= 30
                        }
                        onPress={() => {
                          setPaidDurationInput(
                            String(parsedPaidDurationDays + 1),
                          );
                          setError('');
                        }}
                        style={({ pressed }) => [
                          styles.stepper,
                          { opacity: pressed ? 0.65 : 1 },
                        ]}
                      >
                        <Feather name="plus" size={14} color={home.text} />
                      </Pressable>
                    </View>
                  )}
                </View>
                {selectedPlan?.kind !== 'free' && !isPaidDurationValid ? (
                  <ErrorText>Enter a whole number from 1 to 30 days.</ErrorText>
                ) : null}
                <View style={styles.priceNote}>
                  <View style={styles.priceNoteDot} />
                  <Text style={styles.priceNoteText}>
                    Price depends on player capacity, not duration.
                  </Text>
                </View>
              </View>

              {error ? <ErrorText>{error}</ErrorText> : null}
            </View>
          ) : selectedPlan ? (
            <View style={styles.confirmContent}>
              <Text style={styles.confirmIntro}>
                The details are set. Here’s the Pint War you’re bringing to the
                table.
              </Text>
              <Card style={styles.summaryCard}>
                <View style={styles.summaryHeader}>
                  <Text style={styles.summaryKicker}>
                    PINT WARS · COMPETITION SUMMARY
                  </Text>
                  <View style={styles.readyPill}>
                    <View style={styles.readyDot} />
                    <Text style={styles.readyText}>READY TO START</Text>
                  </View>
                </View>
                <Text style={styles.summaryName}>{name.trim()}</Text>
                <View style={styles.summarySubline}>
                  <Feather name="shield" size={13} color={home.gold} />
                  <Text style={styles.summarySublineText}>
                    Your crew’s Pint War
                  </Text>
                </View>
                <View style={styles.summaryRule} />
                <View style={styles.factsGrid}>
                  <SummaryFact
                    icon="users"
                    label="CAPACITY"
                    value={`${selectedPlan.capacity} players`}
                    index={0}
                    styles={styles}
                  />
                  <SummaryFact
                    icon="calendar"
                    label="DURATION"
                    value={
                      confirmedDurationDays
                        ? `${confirmedDurationDays} ${confirmedDurationDays === 1 ? 'day' : 'days'}`
                        : 'Select 1–30 days'
                    }
                    index={1}
                    styles={styles}
                  />
                  <SummaryFact
                    icon="clock"
                    label="FORMAT"
                    value={
                      selectedPlan.kind === 'free' ? 'Free trial' : 'One-time'
                    }
                    index={2}
                    styles={styles}
                  />
                  <SummaryFact
                    icon="credit-card"
                    label="PRICE"
                    value={confirmedPrice}
                    index={3}
                    styles={styles}
                  />
                </View>
                {selectedPlan.kind === 'paid' ? (
                  <View style={styles.purchaseDisclosure}>
                    <Feather
                      name="credit-card"
                      size={13}
                      color={home.gold}
                    />
                    <Text style={styles.purchaseDisclosureText}>
                      ONE-TIME PURCHASE — NOT A SUBSCRIPTION
                    </Text>
                  </View>
                ) : null}
              </Card>

              {selectedPlan.kind === 'free' ? (
                <View style={styles.assurance}>
                  <Feather name="shield" size={15} color={home.gold} />
                  <Text style={styles.assuranceText}>
                    <Text style={styles.assuranceEmphasis}>
                      4 players · 10 days · Free.
                    </Text>{' '}
                    Your trial Pint War is ready.
                  </Text>
                </View>
              ) : null}

              {error ? <ErrorText>{error}</ErrorText> : null}

              {selectedPlan.kind === 'paid' ? (
                <View style={styles.feedback}>
                  {revenueCat.status === 'loading' ||
                  paidAvailabilityQuery.isLoading ? (
                    <View style={styles.statusRow}>
                      <ActivityIndicator color={home.gold} />
                      <Text style={styles.statusText}>
                        Checking one-time purchase availability…
                      </Text>
                    </View>
                  ) : null}
                  {revenueCat.error ? (
                    <ErrorText>{revenueCat.error}</ErrorText>
                  ) : null}
                  {revenueCat.isConfigured &&
                  !offeringHasExactlyLeagueProducts ? (
                    <ErrorText>
                      The RevenueCat Default offering must contain exactly
                      these four products: pint_war_6_players_v2,
                      pint_war_10_players, pint_war_14_players, and
                      pint_war_16_players.
                    </ErrorText>
                  ) : null}
                  {paidAvailabilityQuery.isError ? (
                    <ErrorText>
                      Could not check whether purchase verification is ready.
                    </ErrorText>
                  ) : paidAvailabilityQuery.data === false ? (
                    <ErrorText>
                      Purchase verification is not configured yet. You will
                      not be charged.
                    </ErrorText>
                  ) : null}
                  {pendingPurchase &&
                  pendingPurchaseProduct &&
                  !pendingPurchaseMatchesSelectedPlan ? (
                    <ErrorText>
                      The store completed a {pendingPurchaseProduct.capacity}
                      -player purchase, but this Pint War is set to{' '}
                      {selectedPlan.capacity} players. No Pint War was created.
                      Switch to the purchased size to retry without paying
                      again.
                    </ErrorText>
                  ) : null}
                  {pendingPurchase && !pendingPurchaseProduct ? (
                    <ErrorText>
                      RevenueCat confirmed a product that is not one of the
                      supported Pint Wars sizes. No Pint War was created. Do
                      not purchase again; contact support before continuing.
                    </ErrorText>
                  ) : null}
                </View>
              ) : profileQuery.isLoading ? (
                <View style={styles.statusRow}>
                  <ActivityIndicator color={home.gold} />
                  <Text style={styles.statusText}>
                    Checking your free-trial availability…
                  </Text>
                </View>
              ) : profileQuery.isError ? (
                <ErrorText>Could not check your free-trial entitlement.</ErrorText>
              ) : freeTrialUsed ? (
                <View style={styles.notice}>
                  <Text style={styles.noticeTitle}>Free trial already used</Text>
                  <Text style={styles.noticeText}>
                    Each account gets one 4-player, 10-day trial. You can still
                    join paid Pint Wars when they are available.
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.footer}>
            {showCreateScreen ? (
              <FlowAction
                testID="pint-war-continue"
                label="Continue"
                disabled={!canContinue}
                styles={styles}
                onPress={() => {
                  setError('');
                  setIsConfirmStep(true);
                }}
              />
            ) : selectedPlan?.kind === 'paid' ? (
              pendingPurchase &&
              pendingPurchaseProduct &&
              !pendingPurchaseMatchesSelectedPlan ? (
                <FlowAction
                  testID="pint-war-use-purchased-size"
                  label={`Use purchased ${pendingPurchaseProduct.capacity}-player size`}
                  disabled={isBusy}
                  styles={styles}
                  onPress={() => {
                    setSelectedPlanId(
                      `paid-${pendingPurchaseProduct.capacity}`,
                    );
                    setError('');
                  }}
                />
              ) : pendingPurchase && !pendingPurchaseProduct ? null : pendingPurchase &&
                pendingPurchaseMatchesSelectedPlan ? (
                <FlowAction
                  testID="pint-war-retry-verification"
                  label={`Retry verification and create ${selectedPlan.capacity}-player Pint War`}
                  loading={paidMutation.isPending}
                  disabled={!name.trim() || isBusy}
                  styles={styles}
                  onPress={() => {
                    if (!selectedPlan.productIdentifier) return;
                    setError('');
                    paidMutation.mutate({
                      ...pendingPurchase,
                      selectedProductIdentifier:
                        selectedPlan.productIdentifier,
                    });
                  }}
                />
              ) : (
                <FlowAction
                  testID="pint-war-purchase"
                  label={`Purchase ${selectedPlan.capacity}-player Pint War`}
                  loading={isPurchasing}
                  disabled={
                    !name.trim() ||
                    !isPaidDurationValid ||
                    !paidCheckoutReady ||
                    isBusy
                  }
                  styles={styles}
                  onPress={() => void purchaseSelectedPlan()}
                />
              )
            ) : selectedPlan?.kind === 'free' ? (
              <FlowAction
                testID="pint-war-create-free"
                label="Create Free Pint War"
                loading={mutation.isPending}
                disabled={
                  !name.trim() ||
                  profileQuery.isLoading ||
                  profileQuery.isError ||
                  freeTrialUsed ||
                  Boolean(pendingPurchase) ||
                  mutation.isPending
                }
                styles={styles}
                onPress={() => mutation.mutate()}
              />
            ) : null}
          </View>
        </View>
      </KeyboardAwareScrollViewCompat>
    </Screen>
  );
}

type CreateWarStyles = ReturnType<typeof createCreateWarStyles>;

function PlanChoice({
  plan,
  selected,
  price,
  styles,
  onPress,
}: {
  plan: LeaguePlan;
  selected: boolean;
  price: string;
  styles: CreateWarStyles;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={`pint-war-capacity-${plan.capacity}`}
      accessibilityRole="radio"
      accessibilityLabel={
        plan.kind === 'free'
          ? `${plan.capacity} players, 10-day free trial, Free`
          : `${plan.capacity} players, ${price}, one-time purchase`
      }
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.plan,
        plan.kind === 'free' && styles.freePlan,
        selected && styles.selectedPlan,
        { opacity: pressed ? 0.78 : 1 },
      ]}
    >
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
      <View style={styles.planCopy}>
        <View style={styles.planTitleRow}>
          <Text style={styles.planTitle}>{plan.capacity} players</Text>
          {selected ? (
            <Text style={styles.selectedLabel}>SELECTED</Text>
          ) : null}
        </View>
        {plan.kind === 'free' ? (
          <Text style={styles.planDetail}>10-day free trial</Text>
        ) : null}
      </View>
      <Text style={styles.planPrice}>{price}</Text>
    </Pressable>
  );
}

function SummaryFact({
  icon,
  label,
  value,
  index,
  styles,
}: {
  icon: 'users' | 'calendar' | 'clock' | 'credit-card';
  label: string;
  value: string;
  index: number;
  styles: CreateWarStyles;
}) {
  return (
    <View
      style={[
        styles.fact,
        index % 2 === 1 && styles.factRight,
        index > 1 && styles.factBottom,
      ]}
    >
      <View style={styles.factLabelRow}>
        <Feather name={icon} size={12} color={home.gold} />
        <Text style={styles.factLabel}>{label}</Text>
      </View>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

function FlowAction({
  testID,
  label,
  onPress,
  styles,
  disabled = false,
  loading = false,
}: {
  testID: string;
  label: string;
  onPress: () => void;
  styles: CreateWarStyles;
  disabled?: boolean;
  loading?: boolean;
}) {
  const unavailable = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: unavailable, busy: loading }}
      disabled={unavailable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        { opacity: unavailable ? 0.48 : pressed ? 0.78 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color={home.actionInk} /> : null}
      <Text style={styles.primaryButtonText}>{label}</Text>
      {!loading ? (
        <Feather name="check" size={17} color={home.actionInk} />
      ) : null}
    </Pressable>
  );
}

function createCreateWarStyles(fontsLoaded: boolean) {
  const medium = fontsLoaded ? 'WarsDM_500' : 'Inter_500Medium';
  const bold = fontsLoaded ? 'WarsDM_700' : 'Inter_700Bold';
  const headline = fontsLoaded ? 'WarsSpace_600' : 'Inter_600SemiBold';

  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: home.background },
    scroll: { flex: 1 },
    scrollContent: {
      flexGrow: 1,
      width: '100%',
      alignItems: 'center',
      paddingHorizontal: 19,
    },
    page: { width: '100%', maxWidth: 430, flexGrow: 1 },
    header: {
      height: 52,
      marginBottom: 9,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    backButton: {
      width: 36,
      height: 36,
      borderWidth: 1,
      borderColor: home.line,
      borderRadius: 12,
      backgroundColor: home.panel,
      alignItems: 'center',
      justifyContent: 'center',
    },
    brand: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
    },
    crest: { width: 24, height: 28 },
    wordmark: { width: 82, height: 25 },
    headerSpacer: { width: 36, height: 36 },
    heading: { marginBottom: 15 },
    eyebrow: {
      marginBottom: 5,
      color: home.gold,
      fontFamily: bold,
      fontSize: 9,
      letterSpacing: 1.45,
      lineHeight: 12,
    },
    title: {
      color: home.text,
      fontFamily: headline,
      fontSize: 25,
      lineHeight: 29,
      letterSpacing: -0.8,
    },
    description: {
      marginTop: 7,
      color: home.muted,
      fontFamily: medium,
      fontSize: 12,
      lineHeight: 18,
    },
    form: { gap: 14 },
    section: { minWidth: 0, gap: 7 },
    sectionHeading: {
      minHeight: 15,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    sectionLabel: {
      color: home.text,
      fontFamily: bold,
      fontSize: 10,
      lineHeight: 12,
      letterSpacing: 1.05,
    },
    sectionMeta: {
      color: home.muted,
      fontFamily: bold,
      fontSize: 8,
      lineHeight: 11,
      letterSpacing: 0.8,
    },
    nameInputShell: {
      height: 46,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 11,
      borderWidth: 1,
      borderColor: home.line,
      borderRadius: 11,
      backgroundColor: home.panelSoft,
    },
    nameIcon: {
      width: 25,
      height: 25,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: home.line,
      borderRadius: 7,
      backgroundColor: home.panel,
    },
    nameInput: {
      minWidth: 0,
      flex: 1,
      padding: 0,
      color: home.text,
      fontFamily: medium,
      fontSize: 14,
    },
    characterCount: {
      color: home.muted,
      fontFamily: medium,
      fontSize: 9,
      fontVariant: ['tabular-nums'],
    },
    planList: { gap: 5 },
    plan: {
      minHeight: 42,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 11,
      borderWidth: 1,
      borderColor: home.line,
      borderRadius: 10,
      backgroundColor: home.panelSoft,
    },
    freePlan: { minHeight: 46, borderColor: home.line },
    selectedPlan: {
      borderColor: home.gold,
      backgroundColor: home.panel,
    },
    radio: {
      width: 16,
      height: 16,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: home.muted,
      borderRadius: 8,
    },
    radioSelected: { borderColor: home.gold },
    radioDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: home.gold,
    },
    planCopy: { flex: 1, gap: 4 },
    planTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    planTitle: {
      color: home.text,
      fontFamily: medium,
      fontSize: 12,
      lineHeight: 15,
    },
    selectedLabel: {
      color: home.gold,
      fontFamily: bold,
      fontSize: 7,
      letterSpacing: 0.8,
    },
    planDetail: {
      color: home.muted,
      fontFamily: medium,
      fontSize: 10,
      lineHeight: 12,
    },
    planPrice: {
      color: home.text,
      fontFamily: bold,
      fontSize: 12,
      fontVariant: ['tabular-nums'],
    },
    notice: {
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 9,
      borderWidth: 1,
      borderColor: home.line,
      borderRadius: 9,
      backgroundColor: home.panel,
    },
    noticeTitle: { color: home.text, fontFamily: bold, fontSize: 12 },
    noticeText: {
      color: home.muted,
      fontFamily: medium,
      fontSize: 11,
      lineHeight: 16,
    },
    durationHeading: {
      minHeight: 42,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    durationRange: {
      marginTop: 4,
      color: home.muted,
      fontFamily: medium,
      fontSize: 10,
      lineHeight: 13,
    },
    durationControl: {
      height: 38,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 6,
      borderWidth: 1,
      borderColor: home.line,
      borderRadius: 10,
      backgroundColor: home.panelSoft,
    },
    fixedDuration: { paddingHorizontal: 10 },
    stepper: {
      width: 23,
      height: 24,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 6,
      backgroundColor: home.panel,
    },
    durationInput: {
      width: 24,
      padding: 0,
      color: home.text,
      fontFamily: bold,
      fontSize: 15,
      textAlign: 'center',
      fontVariant: ['tabular-nums'],
    },
    durationValue: {
      color: home.text,
      fontFamily: bold,
      fontSize: 15,
      fontVariant: ['tabular-nums'],
    },
    durationUnit: {
      color: home.muted,
      fontFamily: medium,
      fontSize: 10,
    },
    fixedLabel: {
      marginLeft: 2,
      color: home.gold,
      fontFamily: bold,
      fontSize: 7,
      letterSpacing: 0.65,
    },
    priceNote: {
      minHeight: 29,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 9,
      borderWidth: 1,
      borderColor: home.line,
      borderRadius: 8,
      backgroundColor: home.panel,
    },
    priceNoteDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor: home.gold,
    },
    priceNoteText: {
      flex: 1,
      color: home.muted,
      fontFamily: medium,
      fontSize: 9,
      lineHeight: 13,
    },
    confirmContent: { gap: 13 },
    confirmIntro: {
      marginHorizontal: 1,
      color: home.muted,
      fontFamily: medium,
      fontSize: 12,
      lineHeight: 18,
    },
    summaryCard: {
      gap: 0,
      padding: 16,
      borderColor: home.gold,
      borderRadius: 19,
      backgroundColor: home.panel,
    },
    summaryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    summaryKicker: {
      flexShrink: 1,
      color: home.gold,
      fontFamily: bold,
      fontSize: 8,
      letterSpacing: 1.1,
      lineHeight: 11,
    },
    readyPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 7,
      paddingVertical: 5,
      borderWidth: 1,
      borderColor: home.line,
      borderRadius: 20,
      backgroundColor: home.panelSoft,
    },
    readyDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor: home.gold,
    },
    readyText: {
      color: home.gold,
      fontFamily: bold,
      fontSize: 7,
      letterSpacing: 0.55,
    },
    summaryName: {
      marginTop: 13,
      color: home.text,
      fontFamily: headline,
      fontSize: 25,
      lineHeight: 29,
      letterSpacing: -1,
    },
    summarySubline: {
      marginTop: 7,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    summarySublineText: {
      color: home.muted,
      fontFamily: medium,
      fontSize: 11,
      lineHeight: 14,
    },
    summaryRule: {
      height: StyleSheet.hairlineWidth,
      marginTop: 15,
      marginBottom: 4,
      backgroundColor: home.line,
    },
    factsGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    fact: {
      width: '50%',
      minHeight: 61,
      justifyContent: 'center',
      paddingVertical: 9,
      paddingRight: 8,
    },
    factRight: {
      paddingLeft: 13,
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderLeftColor: home.line,
    },
    factBottom: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: home.line,
    },
    factLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    factLabel: {
      color: home.muted,
      fontFamily: bold,
      fontSize: 8,
      letterSpacing: 0.85,
    },
    factValue: {
      marginTop: 6,
      color: home.text,
      fontFamily: headline,
      fontSize: 16,
      lineHeight: 20,
      letterSpacing: -0.45,
    },
    purchaseDisclosure: {
      minHeight: 38,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      marginTop: 4,
      paddingHorizontal: 9,
      borderWidth: 1,
      borderColor: home.gold,
      borderRadius: 9,
      backgroundColor: home.panelSoft,
    },
    purchaseDisclosureText: {
      flex: 1,
      color: home.gold,
      fontFamily: bold,
      fontSize: 8,
      letterSpacing: 0.45,
    },
    assurance: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 9,
      marginHorizontal: 3,
    },
    assuranceText: {
      flex: 1,
      color: home.muted,
      fontFamily: medium,
      fontSize: 11,
      lineHeight: 16,
    },
    assuranceEmphasis: { color: home.text, fontFamily: bold },
    feedback: { gap: 9 },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    statusText: {
      flex: 1,
      color: home.muted,
      fontFamily: medium,
      fontSize: 11,
      lineHeight: 15,
    },
    footer: { marginTop: 'auto', paddingTop: 16 },
    primaryButton: {
      minHeight: 53,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 12,
      borderRadius: 14,
      backgroundColor: home.gold,
    },
    primaryButtonText: {
      flexShrink: 1,
      color: home.actionInk,
      fontFamily: bold,
      fontSize: 14,
      textAlign: 'center',
    },
  });
}