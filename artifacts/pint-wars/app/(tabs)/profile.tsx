import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { fetch as expoFetch } from 'expo/fetch';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, ErrorText, Field, Screen, Title, uiStyles } from '@/components/AppUi';
import { getMyProfile, updateMyProfile } from '@/src/lib/league-service';
import { getSupabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/providers/AuthProvider';
import { useColors } from '@/hooks/useColors';

type DeletionTestResult = {
  status: string;
  body: string;
};

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
  const [deletionTestPending, setDeletionTestPending] = useState(false);
  const [deletionTestResult, setDeletionTestResult] = useState<DeletionTestResult | null>(null);

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

  async function sendDeletionTestRequest() {
    setDeletionTestPending(true);
    setDeletionTestResult(null);

    try {
      const apiDomain = process.env.EXPO_PUBLIC_DOMAIN?.trim();
      if (!apiDomain) {
        setDeletionTestResult({
          status: 'No HTTP response',
          body: JSON.stringify({ message: 'The API domain is not configured in this development build.' }, null, 2),
        });
        return;
      }

      const { data, error: sessionError } = await getSupabase().auth.getSession();
      const accessToken = data.session?.access_token;
      if (sessionError || !accessToken) {
        setDeletionTestResult({
          status: 'No HTTP response',
          body: JSON.stringify({ message: 'There is no active authenticated Supabase session on this device.' }, null, 2),
        });
        return;
      }

      const domain = apiDomain.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
      const response = await expoFetch(`https://${domain}/api/account/delete`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      const responseText = await response.text();
      let responseBody = responseText || '(empty response body)';
      try {
        if (responseText) {
          responseBody = JSON.stringify(JSON.parse(responseText), null, 2);
        }
      } catch {
        // Keep a non-JSON server response visible as plain text.
      }

      setDeletionTestResult({
        status: `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`,
        body: responseBody,
      });
    } catch {
      setDeletionTestResult({
        status: 'No HTTP response',
        body: JSON.stringify({ message: 'The deletion request could not reach the API.' }, null, 2),
      });
    } finally {
      setDeletionTestPending(false);
    }
  }

  function confirmDeletionTestRequest() {
    Alert.alert(
      'Send account deletion request?',
      'This irreversibly de-identifies the account currently signed in on this device. Continue only with the disposable test account after its Pint War is completed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send deletion request',
          style: 'destructive',
          onPress: () => void sendDeletionTestRequest(),
        },
      ],
    );
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
        {__DEV__ ? (
          <Card style={{ gap: 14 }}>
            <Title eyebrow="Development only">Account deletion test</Title>
            <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', lineHeight: 21 }}>
              Sends an authenticated deletion request for the account currently signed in on this device. This cannot be undone.
            </Text>
            <Button
              label={deletionTestPending ? 'Sending request…' : 'Review deletion request'}
              variant="quiet"
              onPress={confirmDeletionTestRequest}
              loading={deletionTestPending}
              disabled={deletionTestPending}
            />
            {deletionTestResult ? (
              <View style={{ gap: 8 }}>
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold' }}>
                  Response status: {deletionTestResult.status}
                </Text>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }}>
                  Response body
                </Text>
                <Text
                  selectable
                  style={{
                    color: colors.foreground,
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    borderWidth: 1,
                    borderRadius: 12,
                    padding: 12,
                    fontFamily: 'Inter_400Regular',
                    fontSize: 12,
                    lineHeight: 18,
                  }}
                >
                  {deletionTestResult.body}
                </Text>
              </View>
            ) : null}
          </Card>
        ) : null}
        <Button label="Sign out" variant="quiet" onPress={logOut} />
      </ScrollView>
    </Screen>
  );
}