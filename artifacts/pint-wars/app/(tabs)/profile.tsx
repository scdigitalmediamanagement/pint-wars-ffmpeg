import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeleteMyAccount } from '@workspace/api-client-react';
import { Button, Card, ErrorText, Field, Screen, Title, uiStyles } from '@/components/AppUi';
import { getMyProfile, updateMyProfile } from '@/src/lib/league-service';
import { useAuth } from '@/src/providers/AuthProvider';
import { useColors } from '@/hooks/useColors';
import { SUPPORT_EMAIL } from '@/components/PublicInfo';

function deletionFailureMessage(error: unknown) {
  if (error && typeof error === 'object') {
    const response = error as { status?: unknown; data?: unknown };
    const message =
      response.data &&
      typeof response.data === 'object' &&
      'message' in response.data &&
      typeof response.data.message === 'string'
        ? response.data.message
        : '';

    if (response.status === 400 && message.includes('active Pint War')) {
      return 'Finish or end the active Pint War you host, then try deleting your account again.';
    }
    if (response.status === 401) {
      return 'Your sign-in has expired. Sign in again and retry account deletion.';
    }
  }

  return `We couldn't complete account deletion. Please try again or contact ${SUPPORT_EMAIL}.`;
}

export default function ProfileScreen() {
  const colors = useColors();
  const { user, signOut } = useAuth();
  const client = useQueryClient();
  const deleteAccountMutation = useDeleteMyAccount();
  const profileQuery = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getMyProfile(user?.id as string),
    enabled: Boolean(user?.id),
  });
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [showDeletionConfirmation, setShowDeletionConfirmation] = useState(false);
  const [deletionError, setDeletionError] = useState('');

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

  async function deleteAccount() {
    setDeletionError('');
    try {
      await deleteAccountMutation.mutateAsync();
    } catch (deletionRequestError) {
      setDeletionError(deletionFailureMessage(deletionRequestError));
      return;
    }

    client.clear();
    try {
      await signOut('local');
      router.replace('/(auth)/sign-in');
    } catch {
      setShowDeletionConfirmation(false);
      setDeletionError(
        'Your deletion request completed, but this device could not clear its saved sign-in. Restart the app and contact support if you need help.',
      );
    }
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
        <Card style={{ gap: 12 }}>
          <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 18 }}>Privacy and support</Text>
          <Button label="Privacy Policy" variant="quiet" onPress={() => router.push('/privacy')} testID="profile-privacy-link" />
          <Button label="Support" variant="quiet" onPress={() => router.push('/support')} testID="profile-support-link" />
          <Button label="Account deletion details" variant="quiet" onPress={() => router.push('/delete-account')} testID="profile-deletion-details-link" />
        </Card>
        <Card style={{ gap: 14 }}>
          <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 18 }}>Delete Account</Text>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', lineHeight: 22 }}>
            This is permanent and cannot be undone. Your profile will be de-identified, sign-in will be blocked, and pint-proof photos and personal location details will be removed. Historical league, score, purchase, and audit records may remain.
          </Text>
          {deletionError ? <ErrorText>{deletionError}</ErrorText> : null}
          {showDeletionConfirmation ? (
            <>
              <Text style={{ color: colors.destructive, fontFamily: 'Inter_600SemiBold', lineHeight: 21 }}>
                Confirm permanent deletion? This request cannot be reversed. Deletion is blocked while you host an active Pint War.
              </Text>
              <Button
                label="Confirm Permanent Deletion"
                variant="destructive"
                onPress={() => void deleteAccount()}
                loading={deleteAccountMutation.isPending}
                testID="profile-confirm-delete-account"
              />
              <Button
                label="Cancel"
                variant="quiet"
                onPress={() => {
                  setShowDeletionConfirmation(false);
                  setDeletionError('');
                }}
                disabled={deleteAccountMutation.isPending}
                testID="profile-cancel-delete-account"
              />
            </>
          ) : (
            <Button
              label="Delete Account"
              variant="destructive"
              onPress={() => {
                setDeletionError('');
                setShowDeletionConfirmation(true);
              }}
              testID="profile-delete-account"
            />
          )}
        </Card>
        <Button label="Sign out" variant="quiet" onPress={logOut} />
      </ScrollView>
    </Screen>
  );
}