import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  useGetPintWarMemories,
} from '@workspace/api-client-react';
import { Button, Card, ErrorText, Screen, uiStyles } from '@/components/AppUi';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/src/providers/AuthProvider';
import { getLeagueDashboard, getLeagueSummary } from '@/src/lib/league-service';
import type { LeagueSummary } from '@/src/types/league';
import { PintWarMemoriesPresentation } from '@/src/components/PintWarMemoriesPresentation';
import memoriesColors from '@/constants/memoriesColors';

const memoriesHeaderOptions = {
  headerShown: true,
  title: 'Pint War Memories',
  headerBackTitle: 'Back',
  headerTitleAlign: 'center',
  headerShadowVisible: false,
  headerStyle: { backgroundColor: memoriesColors.background },
  headerTintColor: memoriesColors.text,
  headerTitleStyle: { fontFamily: 'DMSans_700Bold', fontSize: 17 },
} as const;

function MemoriesState({
  title,
  message,
  icon,
  onRetry,
  isRetrying,
}: {
  title: string;
  message: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onRetry?: () => void;
  isRetrying?: boolean;
}) {
  const colors = useColors();
  return (
    <Card style={styles.stateCard}>
      <Ionicons name={icon} size={28} color={colors.accent} />
      <Text style={[styles.stateTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.stateMessage, { color: colors.mutedForeground }]}>{message}</Text>
      {onRetry ? (
        <Button
          label="Try again"
          onPress={onRetry}
          loading={Boolean(isRetrying)}
          disabled={Boolean(isRetrying)}
          testID="retry-pint-war-memories"
        />
      ) : null}
    </Card>
  );
}

function LoadingState({ label }: { label: string }) {
  const colors = useColors();
  return (
    <View style={styles.loadingState}>
      <ActivityIndicator color={colors.accent} size="large" />
      <Text style={[styles.stateMessage, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

export default function PintWarMemoriesScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const dashboardQuery = useQuery({
    queryKey: ['league-memories-dashboard', user?.id, leagueId],
    queryFn: () => getLeagueDashboard(leagueId),
    enabled: Boolean(user && leagueId),
  });
  const summaryQuery = useQuery({
    queryKey: ['league-memories-summary', user?.id, leagueId],
    queryFn: () => getLeagueSummary(leagueId),
    enabled: Boolean(user && leagueId && dashboardQuery.data?.league.status === 'completed'),
  });
  const memoriesQuery = useGetPintWarMemories(leagueId, {
    query: {
      queryKey: ['league-memories-events', user?.id, leagueId],
      enabled: Boolean(
        user &&
        leagueId &&
        dashboardQuery.data?.league.status === 'completed' &&
        summaryQuery.data,
      ),
    },
  });

  if (!leagueId) {
    return (
      <Screen>
        <Stack.Screen options={memoriesHeaderOptions} />
        <View style={uiStyles.content}>
          <ErrorText>This Pint War could not be identified.</ErrorText>
        </View>
      </Screen>
    );
  }

  if (!user) {
    return (
      <Screen>
        <Stack.Screen options={memoriesHeaderOptions} />
        <View style={uiStyles.content}>
          <MemoriesState
            title="Sign in to create Memories"
            message="Only authenticated members of this completed Pint War can access its photos."
            icon="lock-closed-outline"
          />
        </View>
      </Screen>
    );
  }

  if (dashboardQuery.isLoading) {
    return (
      <Screen>
        <Stack.Screen options={memoriesHeaderOptions} />
        <LoadingState label="Checking completed-war access…" />
      </Screen>
    );
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return (
      <Screen>
        <Stack.Screen options={memoriesHeaderOptions} />
        <View style={uiStyles.content}>
          <MemoriesState
            title="Could not load this Pint War"
            message="Check your connection and confirm that you are a member of this Pint War."
            icon="cloud-offline-outline"
            onRetry={() => void dashboardQuery.refetch()}
            isRetrying={dashboardQuery.isFetching}
          />
        </View>
      </Screen>
    );
  }

  const { league } = dashboardQuery.data;

  if (league.status !== 'completed') {
    return (
      <Screen>
        <Stack.Screen options={memoriesHeaderOptions} />
        <View style={uiStyles.content}>
          <MemoriesState
            title="Memories unlock when the war is complete"
            message="Come back after the final Pint War results are recorded."
            icon="time-outline"
          />
        </View>
      </Screen>
    );
  }

  if (summaryQuery.isError || memoriesQuery.isError) {
    const failedQuery = summaryQuery.isError ? summaryQuery : memoriesQuery;
    return (
      <Screen>
        <Stack.Screen options={memoriesHeaderOptions} />
        <ScrollView contentContainerStyle={[uiStyles.content, styles.page]}>
          <MemoriesState
            title={summaryQuery.isError ? 'The final summary is unavailable' : 'War photos and events could not be loaded'}
            message="No photos or Storage URLs were made public. Your results are unchanged; try loading Memories again."
            icon="cloud-offline-outline"
            onRetry={() => void failedQuery.refetch()}
            isRetrying={failedQuery.isFetching}
          />
        </ScrollView>
      </Screen>
    );
  }

  if (!summaryQuery.data || !memoriesQuery.data) {
    return (
      <Screen>
        <Stack.Screen options={memoriesHeaderOptions} />
        <LoadingState
          label={summaryQuery.isLoading ? 'Gathering final results…' : 'Finding moments from the entire Pint War…'}
        />
      </Screen>
    );
  }

  return (
    <Screen style={{ backgroundColor: memoriesColors.background }}>
      <Stack.Screen options={memoriesHeaderOptions} />
      <PintWarMemoriesPresentation
        key={`${user.id}:${league.id}`}
        userId={user.id}
        league={{
          id: league.id,
          name: league.name,
          completed_at: league.completed_at,
        }}
        summary={summaryQuery.data as LeagueSummary}
        events={memoriesQuery.data.events}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { gap: 16, paddingTop: 18, paddingBottom: 32 },
  stateCard: { alignItems: 'center', gap: 12, padding: 24 },
  stateTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, textAlign: 'center' },
  stateMessage: { maxWidth: 330, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, textAlign: 'center' },
  loadingState: { flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
});