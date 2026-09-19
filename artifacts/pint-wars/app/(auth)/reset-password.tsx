import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { Button, ErrorText, Field, Screen, Title, uiStyles } from '@/components/AppUi';
import { useAuth } from '@/src/providers/AuthProvider';
import { useColors } from '@/hooks/useColors';

export default function ResetPasswordScreen() {
  const colors = useColors();
  const { updatePassword, isConfigured, isRecoverySession, session } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!success) return;
    const timeout = setTimeout(() => router.replace('/(tabs)'), 900);
    return () => clearTimeout(timeout);
  }, [success]);

  async function submit() {
    setError('');
    if (password.length < 6) {
      setError('Use a password with at least 6 characters.');
      return;
    }
    if (password !== confirmation) {
      setError('The passwords do not match.');
      return;
    }
    if (!session || !isRecoverySession) {
      setError('This reset link has expired. Request a new one and try again.');
      return;
    }

    try {
      setLoading(true);
      await updatePassword(password);
      setSuccess('Your password has been updated. Opening Pint Wars…');
    } catch {
      setError('We could not update your password. Request a new reset link and try again.');
    } finally {
      setLoading(false);
    }
  }

  const recoveryUnavailable = !session || !isRecoverySession;

  return (
    <Screen>
      <KeyboardAwareScrollViewCompat contentContainerStyle={[uiStyles.content, { paddingTop: 68, gap: 24 }]}>
        <View style={{ gap: 10 }}>
          <Title eyebrow="Account access">Choose a new password</Title>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 16, lineHeight: 24 }}>
            Set a new password for your Pint Wars account.
          </Text>
        </View>
        {!isConfigured ? (
          <ErrorText>Supabase is not configured. Add the authentication environment variables to continue.</ErrorText>
        ) : recoveryUnavailable ? (
          <ErrorText>This reset link has expired or is no longer valid. Request a new one to continue.</ErrorText>
        ) : success ? (
          <Text style={{ color: colors.primary, fontFamily: 'Inter_500Medium', fontSize: 15, lineHeight: 22 }}>
            {success}
          </Text>
        ) : (
          <View style={{ gap: 15 }}>
            <Field
              label="New password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              editable={!loading}
            />
            <Field
              label="Confirm new password"
              value={confirmation}
              onChangeText={setConfirmation}
              secureTextEntry
              autoComplete="new-password"
              editable={!loading}
            />
            {error ? <ErrorText>{error}</ErrorText> : null}
            <Button label="Update password" onPress={submit} loading={loading} disabled={!isConfigured} />
          </View>
        )}
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Button label="Return to sign in" variant="quiet" onPress={() => router.replace('/(auth)/sign-in')} />
        </View>
      </KeyboardAwareScrollViewCompat>
    </Screen>
  );
}