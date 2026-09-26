import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useDeleteMyAccount } from '@workspace/api-client-react';
import { Button, ErrorText } from '@/components/AppUi';
import { SUPPORT_EMAIL } from '@/components/PublicInfo';
import { useColors } from '@/hooks/useColors';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/providers/AuthProvider';

const CODE_RESEND_DELAY_MS = 45_000;

function getDeletionFailure(error: unknown) {
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
      return {
        message:
          'You host an active Pint War. Account deletion will not end it automatically. Finish the league or use its existing “End Pint War Early” control, then try again.',
        activeHostLeague: true,
      };
    }
    if (response.status === 401) {
      return {
        message: 'Your verification session expired. Request a new code and try again.',
        activeHostLeague: false,
      };
    }
  }

  return {
    message: `We couldn't complete account deletion. Please try again or contact ${SUPPORT_EMAIL}.`,
    activeHostLeague: false,
  };
}

export default function AccountDeletionRequest() {
  const colors = useColors();
  const { user, isLoading, signOut } = useAuth();
  const client = useQueryClient();
  const deleteAccountMutation = useDeleteMyAccount();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [verified, setVerified] = useState(false);
  const [otpSession, setOtpSession] = useState(false);
  const [otpCreatedFreshSession, setOtpCreatedFreshSession] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [activeHostLeague, setActiveHostLeague] = useState(false);
  const [requestingCode, setRequestingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  useEffect(() => {
    if (!cooldownUntil) return;
    const updateRemaining = () => {
      setCooldownSeconds(Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)));
    };
    updateRemaining();
    const timer = setInterval(updateRemaining, 1000);
    return () => clearInterval(timer);
  }, [cooldownUntil]);

  async function sendCode() {
    const targetEmail = (email.trim() || user?.email || '').toLowerCase();
    if (!supabase || !targetEmail) {
      setError('Enter the email address used for your Pint Wars account.');
      return;
    }

    setRequestingCode(true);
    setError('');
    setInfo('');
    setEmail(targetEmail);

    try {
      await supabase.auth.signInWithOtp({
        email: targetEmail,
        options: { shouldCreateUser: false },
      });
      setInfo(
        'If this email is linked to a Pint Wars account, a one-time code should arrive shortly. This page does not create accounts.',
      );
      setCooldownUntil(Date.now() + CODE_RESEND_DELAY_MS);
    } catch {
      setInfo(
        'If this email is linked to a Pint Wars account, a one-time code should arrive shortly. If it does not, wait before trying again or contact support.',
      );
      setCooldownUntil(Date.now() + CODE_RESEND_DELAY_MS);
    } finally {
      setRequestingCode(false);
    }
  }

  async function verifyCode() {
    if (!supabase) {
      setError('Account deletion is not configured right now.');
      return;
    }

    setVerifyingCode(true);
    setError('');
    try {
      const hadExistingSession = Boolean(user);
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code.replace(/\D/g, ''),
        type: 'email',
      });

      if (verifyError || !data.session) {
        setError('That code could not be verified. Check it and try again.');
        return;
      }

      setVerified(true);
      setOtpSession(true);
      setOtpCreatedFreshSession(!hadExistingSession);
      setInfo('');
    } catch {
      setError('That code could not be verified. Check it and try again.');
    } finally {
      setVerifyingCode(false);
    }
  }

  async function confirmDeletion() {
    setError('');
    setActiveHostLeague(false);

    try {
      await deleteAccountMutation.mutateAsync();
    } catch (deletionError) {
      const result = getDeletionFailure(deletionError);
      setError(result.message);
      setActiveHostLeague(result.activeHostLeague);
      return;
    }

    client.clear();
    try {
      await signOut('local');
    } catch {
      // The Auth user has already been deleted; clear the local copy best-effort.
      await supabase?.auth.signOut({ scope: 'local' }).catch(() => undefined);
    }
    setCode('');
    setEmail('');
    setVerified(false);
    setOtpSession(false);
    setOtpCreatedFreshSession(false);
    setCompleted(true);
  }

  async function cancelOtpRequest() {
    if (otpCreatedFreshSession) {
      await signOut('local').catch(() => undefined);
    }
    setOtpSession(false);
    setOtpCreatedFreshSession(false);
    setVerified(false);
    setCode('');
    setInfo('');
    setError('');
  }

  const canDelete = verified;
  const emailValue = email || user?.email || '';
  const inputStyle = {
    borderColor: colors.border,
    backgroundColor: colors.card,
    color: colors.foreground,
  };

  if (completed) {
    return (
      <View style={{ gap: 12 }}>
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 16 }}>
          Your Pint Wars account deletion steps are complete.
        </Text>
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', lineHeight: 22 }}>
          Your sign-in has been removed. League and score history remains under the generic name “Deleted player”; purchase records may remain in anonymized form to preserve purchase and league integrity. Pint-proof files and personal visit coordinates are removed.
        </Text>
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', lineHeight: 22 }}>
          The RevenueCat deletion request was accepted, or the customer was already absent. RevenueCat processes accepted requests asynchronously, so provider-side erasure may continue after this screen appears. Third-party records may be retained where legally or business-required.
        </Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>
        Checking your sign-in…
      </Text>
    );
  }

  if (!canDelete) {
    return (
      <View style={{ gap: 12 }}>
        <TextInput
          accessibilityLabel="Account email address"
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="Email address"
          placeholderTextColor={colors.mutedForeground}
          style={[
            inputStyle,
            {
              borderWidth: 1,
              borderRadius: 12,
              fontFamily: 'Inter_400Regular',
              fontSize: 16,
              minHeight: 52,
              paddingHorizontal: 14,
            },
          ]}
          value={emailValue}
        />
        {!info ? (
          <Button
            label={requestingCode ? 'Sending code…' : 'Send verification code'}
            onPress={() => void sendCode()}
            loading={requestingCode}
            disabled={requestingCode || !emailValue.trim()}
            testID="web-delete-send-code"
          />
        ) : null}
        {info ? (
          <Text accessibilityLiveRegion="polite" style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', lineHeight: 22 }}>
            {info}
          </Text>
        ) : null}
        {info ? (
          <>
            <TextInput
              accessibilityLabel="Email verification code"
              autoComplete="one-time-code"
              keyboardType="number-pad"
              maxLength={8}
              onChangeText={(value) => setCode(value.replace(/\D/g, ''))}
              placeholder="Verification code"
              placeholderTextColor={colors.mutedForeground}
              style={[
                inputStyle,
                {
                  borderWidth: 1,
                  borderRadius: 12,
                  fontFamily: 'Inter_400Regular',
                  fontSize: 16,
                  letterSpacing: 3,
                  minHeight: 52,
                  paddingHorizontal: 14,
                },
              ]}
              value={code}
            />
            <Button
              label={verifyingCode ? 'Verifying…' : 'Verify email'}
              onPress={() => void verifyCode()}
              loading={verifyingCode}
              disabled={verifyingCode || code.length < 4}
              testID="web-delete-verify-code"
            />
            <Button
              label={cooldownSeconds > 0 ? `Send another code in ${cooldownSeconds}s` : 'Send another code'}
              variant="quiet"
              onPress={() => void sendCode()}
              disabled={requestingCode || cooldownSeconds > 0}
              testID="web-delete-resend-code"
            />
          </>
        ) : null}
        {error ? <ErrorText>{error}</ErrorText> : null}
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 16 }}>
        `Verified email: ${email || user?.email || 'confirmed'}`
      </Text>
      <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', lineHeight: 22 }}>
        This permanently deletes your Supabase sign-in and removes its link to your Pint Wars history. Historical scores and purchase records are retained under “Deleted player.” This cannot be undone.
      </Text>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button
        label="Confirm permanent deletion"
        variant="destructive"
        onPress={() => void confirmDeletion()}
        loading={deleteAccountMutation.isPending}
        disabled={deleteAccountMutation.isPending}
        testID="web-delete-confirm"
      />
      {activeHostLeague ? (
        <Button
          label="Open my leagues"
          variant="quiet"
          onPress={() => router.push('/(tabs)/wars')}
          testID="web-delete-open-leagues"
        />
      ) : null}
      {otpSession ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void cancelOtpRequest()}
          style={{ alignSelf: 'flex-start', paddingVertical: 8 }}
        >
          <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold', textDecorationLine: 'underline' }}>
            Cancel deletion request
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}