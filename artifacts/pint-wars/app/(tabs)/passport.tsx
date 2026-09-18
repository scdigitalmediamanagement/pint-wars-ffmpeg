import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Card, ErrorText, Screen, Title, uiStyles } from '@/components/AppUi';
import { getMyPubPassport, type PubPassportEntry } from '@/src/lib/league-service';
import { useColors } from '@/hooks/useColors';

function formatLocation(entry: PubPassportEntry) {
  if (entry.address) return entry.address;
  return `${entry.latitude.toFixed(4)}, ${entry.longitude.toFixed(4)}`;
}

function formatVisitDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function PassportScreen() {
  const colors = useColors();
  const query = useQuery({
    queryKey: ['pub-passport'],
    queryFn: getMyPubPassport,
  });
  const entries = query.data ?? [];

  return (
    <Screen>
      <ScrollView contentContainerStyle={[uiStyles.content, styles.content]} showsVerticalScrollIndicator={false}>
        <Title eyebrow="Your pub passport">Pub Passport</Title>
        <Card style={styles.summaryCard}>
          <Text style={[styles.summaryNumber, { color: colors.foreground }]}>{entries.length}</Text>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>unique pubs visited</Text>
          <Text style={[styles.summaryNote, { color: colors.mutedForeground }]}>
            This first version groups your location-tagged pint logs. Pub names and addresses will appear when pub identification is connected.
          </Text>
        </Card>

        {query.isLoading ? (
          <View style={styles.state}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : null}

        {query.isError ? (
          <Card style={styles.stateCard}>
            <ErrorText>Could not load your Passport.</ErrorText>
            <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
              {query.error instanceof Error ? query.error.message : 'Try again later.'}
            </Text>
          </Card>
        ) : null}

        {!query.isLoading && !query.isError && !entries.length ? (
          <Card style={styles.stateCard}>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No location-tagged visits yet</Text>
            <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
              Log a pint with location enabled and your recorded visit will appear here. You can still log pints without sharing your location.
            </Text>
          </Card>
        ) : null}

        {!query.isLoading && !query.isError && entries.length ? (
          <View style={styles.list}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Visited pubs</Text>
            {entries.map((entry) => (
              <Card key={entry.location_key} style={styles.pubCard}>
                <View style={styles.pubHeader}>
                  <View style={styles.pubCopy}>
                    <Text style={[styles.pubName, { color: colors.foreground }]}>
                      {entry.pub_name ?? 'Pub name unavailable'}
                    </Text>
                    <Text style={[styles.identificationNote, { color: colors.accent }]}>
                      {entry.pub_name ? 'Identified pub' : 'Waiting for pub identification'}
                    </Text>
                  </View>
                  <Text style={[styles.pintCount, { color: colors.foreground }]}>
                    {entry.pint_count} {entry.pint_count === 1 ? 'pint' : 'pints'}
                  </Text>
                </View>
                <View style={styles.details}>
                  <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Location</Text>
                  <Text style={[styles.detailValue, { color: colors.foreground }]}>{formatLocation(entry)}</Text>
                </View>
                <View style={styles.details}>
                  <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Most recent visit</Text>
                  <Text style={[styles.detailValue, { color: colors.foreground }]}>{formatVisitDate(entry.most_recent_visit)}</Text>
                </View>
              </Card>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 22, gap: 22 },
  summaryCard: { gap: 6 },
  summaryNumber: { fontFamily: 'Inter_700Bold', fontSize: 48, lineHeight: 54 },
  summaryLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  summaryNote: { fontFamily: 'Inter_400Regular', lineHeight: 21, marginTop: 8 },
  state: { alignItems: 'center', paddingVertical: 28 },
  stateCard: { gap: 10 },
  stateText: { fontFamily: 'Inter_400Regular', lineHeight: 21 },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  list: { gap: 12 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 20 },
  pubCard: { gap: 14 },
  pubHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  pubCopy: { flex: 1, gap: 5 },
  pubName: { fontFamily: 'Inter_700Bold', fontSize: 19 },
  identificationNote: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.7, textTransform: 'uppercase' },
  pintCount: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  details: { gap: 4 },
  detailLabel: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  detailValue: { fontFamily: 'Inter_400Regular', lineHeight: 20 },
});