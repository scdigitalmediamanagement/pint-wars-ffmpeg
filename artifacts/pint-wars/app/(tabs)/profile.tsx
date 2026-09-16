import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, ErrorText, Field, Screen, Title, uiStyles } from '@/components/AppUi';
import { getMyProfile, updateMyProfile } from '@/src/lib/league-service';
import { useAuth } from '@/src/providers/AuthProvider';
import { useColors } from '@/hooks/useColors';

export default function ProfileScreen() {
  const colors = useColors();
  const { user, signOut } = useAuth();
  const client = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getMyProfile(user?.id as string),
    enabled: Boolean(user?.id),
  });
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (profileQuery.data?.display_name) setDisplayName(profileQuery.data.display_name);
  }, [profileQuery.data?.display_name]);

  const saveMutation = useMutation({
    mutationFn: () => updateMyProfile(user?.id as string, displayName),
    onSuccess: () => client.invalidateQueries({ queryKey: ['profile', user?.id] }),
    onError: (err) => setError(err instanceof Error ? err.message : 'Could not update your profile.'),
  });

  async function logOut() {
    await signOut();
    router.replace('/(auth)/sign-in');
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={[uiStyles.content, { paddingTop: 22, gap: 22 }]} showsVerticalScrollIndicator={false}>
        <Title eyebrow="Your account">Profile</Title>
        <Card style={{ gap: 16 }}>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>{user?.email}</Text>
          <Field label="Display name" value={displayName} onChangeText={setDisplayName} />
          {profileQuery.isLoading ? <ActivityIndicator color={colors.accent} /> : null}
          {error ? <ErrorText>{error}</ErrorText> : null}
          <Button label="Save profile" onPress={() => saveMutation.mutate()} loading={saveMutation.isPending} disabled={!displayName.trim()} />
        </Card>
        <Button label="Sign out" variant="quiet" onPress={logOut} />
      </ScrollView>
    </Screen>
  );
}