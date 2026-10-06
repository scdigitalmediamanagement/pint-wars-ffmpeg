import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts } from 'expo-font';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeleteMyAccount } from '@workspace/api-client-react';
import { ProfileAction, ProfileDialog, ProfileHeader, ProfileIdentity, ProfileRow, ProfileSectionHeading, ProfileStats } from '@/components/ProfilePresentation';
import { createProfileStyles, profileColors as c } from '@/components/ProfileStyles';
import { getMyLeagues, getMyProfile, getMyPubPassport, updateMyProfile } from '@/src/lib/league-service';
import { useAuth } from '@/src/providers/AuthProvider';
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
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({
    ProfileDM_500: require('@/assets/fonts/wars/DMSans_500Medium.ttf'),
    ProfileDM_700: require('@/assets/fonts/wars/DMSans_700Bold.ttf'),
    ProfileSpace_600: require('@/assets/fonts/wars/SpaceGrotesk_600SemiBold.ttf'),
  });
  const s = useMemo(() => createProfileStyles(fontsLoaded), [fontsLoaded]);
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
  const [editing, setEditing] = useState(false);
  const [deletionOpen, setDeletionOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const leaguesQuery = useQuery({
    queryKey: ['my-leagues', user?.id],
    queryFn: getMyLeagues,
    enabled: Boolean(user?.id),
  });
  const passportQuery = useQuery({
    queryKey: ['pub-passport', user?.id],
    queryFn: getMyPubPassport,
    enabled: Boolean(user?.id),
  });

  useFocusEffect(
    useCallback(() => {
      setDeletionError('');
      if (user?.id) {
        void profileQuery.refetch();
        void leaguesQuery.refetch();
        void passportQuery.refetch();
      }
    }, [user?.id, profileQuery.refetch, leaguesQuery.refetch, passportQuery.refetch]),
  );

  useEffect(() => {
    if (!editing && profileQuery.data?.display_name) setDisplayName(profileQuery.data.display_name);
  }, [profileQuery.data?.display_name, editing]);

  const saveMutation = useMutation({
    mutationFn: () => updateMyProfile(user?.id as string, displayName),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['profile', user?.id] });
      setEditing(false);
      setError('');
    },
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

  function closeDeletion() {
    setDeletionOpen(false);
    setShowDeletionConfirmation(false);
    setDeletionError('');
  }

  async function refresh() {
    if (!user?.id) return;
    setRefreshing(true);
    try {
      await Promise.all([profileQuery.refetch(), leaguesQuery.refetch(), passportQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }

  // Never count membership rows as separate wars, or present location-only
  // Passport counts as an all-time total of every pint logged.
  const wars = leaguesQuery.data && !leaguesQuery.isError
    ? new Set(leaguesQuery.data.map((item) => item.league.id)).size : null;
  const passport = passportQuery.isError ? undefined : passportQuery.data;
  const pubs = passport ? passport.length : null;
  const pints = passport ? passport.reduce((sum, entry) => sum + entry.pint_count, 0) : null;
  const name = profileQuery.data?.display_name || (profileQuery.isLoading ? 'Loading profile…' : 'Pint Wars member');

  return (
    <View style={s.screen} testID="profile-screen">
      <LinearGradient colors={[c.ambient, c.ink]} style={s.ambient} pointerEvents="none" />
      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: Math.max(Platform.OS === 'web' ? 30 : 0, insets.top + 8), paddingBottom: Math.max(110, insets.bottom + 100) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.gold} colors={[c.gold]} />}>
        <View style={s.container}>
          <ProfileHeader s={s} />
          <View style={s.content}>
            <View style={s.heading}>
              <View><Text style={s.eyebrow}>YOUR PINT WARS</Text><Text style={s.title} accessibilityRole="header">Profile</Text></View>
              <View style={s.member}><Feather name="shield" size={11} color={c.gold} /><Text style={s.memberLabel}>MEMBER</Text></View>
            </View>
            <ProfileIdentity name={name} email={user?.email} avatarUrl={profileQuery.data?.avatar_url} s={s} />
            {profileQuery.isError ? <View style={s.errorBox}>
              <Text style={s.error}>Could not load your profile.</Text>
              <Pressable onPress={() => void profileQuery.refetch()} accessibilityRole="button" style={s.retry}><Text style={s.retryLabel}>Try again</Text></Pressable>
            </View> : null}
            <ProfileStats wars={wars} pints={pints} pubs={pubs} s={s} />
            {leaguesQuery.isError || passportQuery.isError ? <View style={s.errorBox}>
              <Text style={s.error}>Some of your summary could not be loaded.</Text>
              <Pressable onPress={() => void refresh()} accessibilityRole="button" style={s.retry}><Text style={s.retryLabel}>Try again</Text></Pressable>
            </View> : null}
            <ProfileSectionHeading title="YOUR CORNER" aside="THE DETAILS" s={s} />
            <View style={s.group}>
              <ProfileRow icon="edit-2" title="Edit Profile" subtitle="Your name and account details" testID="profile-edit"
                onPress={() => { setDisplayName(profileQuery.data?.display_name ?? ''); setError(''); setEditing(true); }} s={s} />
              <ProfileRow icon="flag" title="Pint War History" subtitle="A look back at your past wars" testID="profile-history"
                onPress={() => router.push({ pathname: '/(tabs)/wars', params: { view: 'history' } })} s={s} />
              <ProfileRow icon="star" title="Achievements" subtitle="A little recognition for the road" comingSoon last s={s} />
            </View>
            <ProfileSectionHeading title="HERE TO HELP" aside="SUPPORT" s={s} />
            <View style={s.group}>
              <ProfileRow icon="shield" title="Privacy Policy" quiet onPress={() => router.push('/privacy')} testID="profile-privacy-link" s={s} />
              <ProfileRow icon="help-circle" title="Support" quiet onPress={() => router.push('/support')} testID="profile-support-link" s={s} />
              <ProfileRow icon="map-pin" title="Account Deletion" danger last testID="profile-deletion-open"
                onPress={() => { setDeletionError(''); setShowDeletionConfirmation(false); setDeletionOpen(true); }} s={s} />
            </View>
            <Text style={s.footnote}>A good local is always worth coming back to.</Text>
            <Pressable accessibilityRole="button" onPress={() => void logOut()} style={s.signOut} testID="profile-sign-out"><Text style={s.signOutLabel}>Sign out</Text></Pressable>
          </View>
        </View>
      </ScrollView>
      {Platform.OS === 'web' ? <View style={s.status} pointerEvents="none">
        <Text style={s.statusTime}>9:41</Text><View style={s.statusIcons}>
          <Feather name="bar-chart" size={13} color={c.paper} /><Feather name="wifi" size={13} color={c.paper} /><Feather name="battery" size={16} color={c.paper} />
        </View>
      </View> : null}

      <ProfileDialog visible={editing} title="Edit Profile" onClose={() => setEditing(false)} busy={saveMutation.isPending} s={s}>
        {user?.email ? <Text style={s.body}>{user.email}</Text> : null}
        <View><Text style={s.fieldLabel}>Display name</Text>
          <TextInput accessibilityLabel="Display name" testID="profile-name-input" style={s.input} value={displayName}
            onChangeText={setDisplayName} autoCapitalize="words" autoFocus editable={!saveMutation.isPending} />
        </View>
        {error ? <Text style={s.error} accessibilityLiveRegion="polite">{error}</Text> : null}
        <ProfileAction label="Save profile" onPress={() => { setError(''); saveMutation.mutate(); }} loading={saveMutation.isPending}
          disabled={!displayName.trim()} testID="profile-save-name" s={s} />
      </ProfileDialog>

      <ProfileDialog visible={deletionOpen} title="Delete Account" onClose={closeDeletion} busy={deleteAccountMutation.isPending} s={s}>
          <Text style={s.body}>
            This permanently deletes your Pint Wars sign-in and removes its link to your history. Pint-proof photos and personal visit coordinates are removed. League and score history, plus purchase verification records, remain under “Deleted player.” RevenueCat customer data is not removed by this request in the current setup.
          </Text>
          <ProfileAction label="Account deletion details" quiet testID="profile-deletion-details-link" s={s}
            onPress={() => { closeDeletion(); router.push('/delete-account'); }} />
          {deletionError ? <Text style={s.error} accessibilityLiveRegion="polite">{deletionError}</Text> : null}
          {showDeletionConfirmation ? (
            <>
              <Text style={[s.body, s.danger]}>
                Confirm permanent deletion? This cannot be reversed. You must finish or explicitly end any active Pint War you host; deletion will not end it automatically.
              </Text>
              <ProfileAction
                label="Confirm Permanent Deletion"
                danger
                s={s}
                onPress={() => void deleteAccount()}
                loading={deleteAccountMutation.isPending}
                testID="profile-confirm-delete-account"
              />
              <ProfileAction
                label="Cancel"
                quiet
                s={s}
                onPress={() => {
                  setShowDeletionConfirmation(false);
                  setDeletionError('');
                }}
                disabled={deleteAccountMutation.isPending}
                testID="profile-cancel-delete-account"
              />
            </>
          ) : (
            <ProfileAction
              label="Delete Account"
              danger
              s={s}
              onPress={() => {
                setDeletionError('');
                setShowDeletionConfirmation(true);
              }}
              testID="profile-delete-account"
            />
          )}
      </ProfileDialog>
    </View>
  );
}