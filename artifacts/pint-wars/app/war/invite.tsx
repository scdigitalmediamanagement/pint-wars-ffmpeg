import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, Card, ErrorText, Screen, Title, uiStyles } from '@/components/AppUi';
import { createLeagueInvite, getLeagueDashboard } from '@/src/lib/league-service';
import { PINT_WAR_PRODUCTS, useRevenueCat } from '@/src/providers/RevenueCatProvider';
import { useColors } from '@/hooks/useColors';

function formatEndDateTime(endsAt: string) {
  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) return 'Unavailable';
  return end.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getDurationDays(durationDays: number | null, startsAt: string, endsAt: string) {
  if (durationDays && durationDays > 0) return durationDays;
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(1, Math.ceil((end - start) / 86_400_000));
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

export default function InviteScreen() {
  const colors = useColors();
  const revenueCat = useRevenueCat();
  const { leagueId: routeLeagueId, code, purchasePrice } = useLocalSearchParams<{
    leagueId?: string;
    code?: string;
    purchasePrice?: string;
  }>();
  const leagueId = typeof routeLeagueId === 'string' ? routeLeagueId : '';
  const suppliedPurchasePrice =
    typeof purchasePrice === 'string' ? purchasePrice.trim() : '';
  const [shared, setShared] = useState(false);
  const [inviteCode, setInviteCode] = useState(typeof code === 'string' ? code : '');
  const leagueQuery = useQuery({
    queryKey: ['league-dashboard', leagueId],
    queryFn: () => getLeagueDashboard(leagueId),
    enabled: Boolean(leagueId),
  });
  const inviteMutation = useMutation({
    mutationFn: () => {
      if (!leagueId) throw new Error('League details are unavailable.');
      return createLeagueInvite(leagueId);
    },
    onSuccess: (result) => setInviteCode(result.invite_code),
  });

  useEffect(() => {
    if (!inviteCode && leagueId && !inviteMutation.isPending && !inviteMutation.isError) {
      inviteMutation.mutate();
    }
  }, [inviteCode, leagueId, inviteMutation.isError, inviteMutation.isPending]);

  async function shareInvite() {
    const league = leagueQuery.data?.league;
    if (!league || !inviteCode) return;
    const inviteLink = `pint-wars://invite/${inviteCode}`;
    const activePlayers = leagueQuery.data?.members.filter(
      (member) => member.status === 'active',
    ).length ?? 0;
    const remainingPlaces = Math.max(0, league.capacity - activePlayers);
    const leagueType = league.is_free ? `free ${league.capacity}-player` : `${league.capacity}-player`;
    const availability =
      remainingPlaces === 0
        ? 'This Pint War is full.'
        : `${remainingPlaces} ${remainingPlaces === 1 ? 'place' : 'places'} remain.`;
    await Share.share({
      message: `Join ${league.name}, my ${leagueType} Pint War on Pint Wars. ${availability} Use invite code ${inviteCode} or open ${inviteLink}`,
    });
    setShared(true);
  }

  const dashboard = leagueQuery.data;
  const league = dashboard?.league;
  const activePlayers = dashboard?.members.filter(
    (member) => member.status === 'active',
  ).length ?? 0;
  const remainingPlaces = league
    ? Math.max(0, league.capacity - activePlayers)
    : 0;
  const paidProduct = league?.is_free
    ? undefined
    : PINT_WAR_PRODUCTS.find((product) => product.capacity === league?.capacity);
  const catalogPrice = paidProduct
    ? revenueCat.offering?.availablePackages.find(
        (item) => item.product.identifier === paidProduct.identifier,
      )?.product.priceString
    : undefined;
  const displayPrice = suppliedPurchasePrice || catalogPrice || 'Unavailable';
  const durationDays = league
    ? getDurationDays(league.duration_days, league.starts_at, league.ends_at)
    : null;
  const inviteMessage = league
    ? league.is_free
      ? `Share this code with up to ${Math.max(0, league.capacity - 1)} friends. They will join your free ${league.capacity}-player Pint War.`
      : `Share this code with up to ${Math.max(0, league.capacity - 1)} friends. They will join your ${league.capacity}-player Pint War.`
    : '';

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[uiStyles.content, styles.content]}
        keyboardShouldPersistTaps="handled"
      >
        {leagueQuery.isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.accent} />
            <Text style={[styles.loadingLabel, { color: colors.mutedForeground }]}>
              Loading your Pint War
            </Text>
          </View>
        ) : null}
        {leagueQuery.isError ? (
          <Card style={styles.errorCard}>
            <ErrorText>Could not load this Pint War. Try again to see its invite details.</ErrorText>
            <Button
              label="Retry"
              variant="secondary"
              onPress={() => void leagueQuery.refetch()}
              testID="retry-league-details"
            />
          </Card>
        ) : null}
        {!leagueId ? (
          <Card style={styles.errorCard}>
            <ErrorText>League details are unavailable. Open the Pint War dashboard and try again.</ErrorText>
          </Card>
        ) : null}
        {league && !leagueQuery.isLoading ? (
          <>
            <Title eyebrow={league.is_free ? 'Your war is live' : 'Purchase confirmed'}>
              {league.is_free ? 'Bring in your crew' : 'Your Pint War is ready'}
            </Title>
            {!league.is_free ? (
              <Card style={{ gap: 16 }}>
                <View style={styles.confirmationHeading}>
                  <Ionicons name="checkmark-circle" size={25} color={colors.accent} />
                  <Text style={[styles.confirmationTitle, { color: colors.foreground }]}>
                    Purchase complete
                  </Text>
                </View>
                <Text style={[styles.confirmationCopy, { color: colors.mutedForeground }]}>
                  Your purchase has been verified and your Pint War is live.
                </Text>
                <View style={styles.details}>
                  <DetailRow label="Pint War" value={league.name} />
                  <DetailRow label="Player capacity purchased" value={`${league.capacity} players`} />
                  <DetailRow label="Price paid" value={displayPrice} />
                  <DetailRow
                    label="Duration"
                    value={durationDays ? `${durationDays} ${durationDays === 1 ? 'day' : 'days'}` : 'Unavailable'}
                  />
                  <DetailRow label="League ends" value={formatEndDateTime(league.ends_at)} />
                </View>
              </Card>
            ) : null}
            <Card style={{ gap: 18, alignItems: 'center' }}>
              <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }}>
                INVITE CODE
              </Text>
              <Text
                selectable
                style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 44, letterSpacing: 7 }}
              >
                {inviteMutation.isPending ? '······' : inviteCode || '—'}
              </Text>
              {inviteMutation.isError ? (
                <View style={styles.inviteError}>
                  <ErrorText>Could not load the invite code.</ErrorText>
                  <Button
                    label="Retry invite code"
                    variant="quiet"
                    onPress={() => inviteMutation.mutate()}
                    testID="retry-league-invite"
                  />
                </View>
              ) : null}
              <Text style={[styles.inviteCopy, { color: colors.mutedForeground }]}>
                {inviteMessage}
              </Text>
              <View style={styles.details}>
                <DetailRow label="Pint War" value={league.name} />
                <DetailRow label="Player capacity" value={`${league.capacity} players`} />
                <DetailRow label="Current players" value={`${activePlayers} / ${league.capacity}`} />
                <DetailRow
                  label="Remaining places"
                  value={`${remainingPlaces} ${remainingPlaces === 1 ? 'place' : 'places'}`}
                />
              </View>
            </Card>
            <Button
              label={shared ? 'Invite shared' : 'Share invite'}
              variant="secondary"
              onPress={() => void shareInvite()}
              disabled={!inviteCode || inviteMutation.isPending || leagueQuery.isError}
              testID="share-pint-war-invite"
            />
            <Button
              label="Open league dashboard"
              onPress={() => router.replace(`/war/${league.id}`)}
              testID="open-league-dashboard"
            />
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 58, gap: 20 },
  loading: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingLabel: { fontFamily: 'Inter_400Regular', fontSize: 14 },
  errorCard: { gap: 16 },
  confirmationHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  confirmationTitle: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  confirmationCopy: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21 },
  details: { alignSelf: 'stretch', gap: 12 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  detailLabel: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19 },
  detailValue: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 13, lineHeight: 19, textAlign: 'right' },
  inviteCopy: { textAlign: 'center', fontFamily: 'Inter_400Regular', lineHeight: 21 },
  inviteError: { alignItems: 'center', gap: 8 },
});