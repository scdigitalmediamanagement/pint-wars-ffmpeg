import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Link } from 'expo-router';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { Button, ErrorText, Field, Screen, Title, uiStyles } from '@/components/AppUi';
import { useAuth } from '@/src/providers/AuthProvider';
import { useColors } from '@/hooks/useColors';

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function ForgotPasswordScreen() {
  const colors = useColors();
  const { requestPasswordReset, isConfigured } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError('');
    if (!isValidEmail(email)) {
      setError('Enter a valid email address.');
      return;
    }

    try {
      setLoading(true);
      await requestPasswordReset(email);
      setSubmitted(true);
    } catch {
      setError('We could not send the reset link. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <KeyboardAwareScrollViewCompat contentContainerStyle={[uiStyles.content, { paddingTop: 68, gap: 24 }]}>
        <View style={{ gap: 10 }}>
          <Title eyebrow="Account access">Reset your password</Title>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 16, lineHeight: 24 }}>
            Enter your email and we&apos;ll send instructions to create a new password.
          </Text>
        </View>
        {!isConfigured ? (
          <ErrorText>Supabase is not configured. Add the authentication environment variables to continue.</ErrorText>
        ) : null}
        {submitted ? (
          <Text style={{ color: colors.primary, fontFamily: 'Inter_500Medium', fontSize: 15, lineHeight: 22 }}>
            If an account exists for that email, we&apos;ll send you a password reset link.
          </Text>
        ) : (
          <View style={{ gap: 15 }}>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              editable={!loading}
            />
            {error ? <ErrorText>{error}</ErrorText> : null}
            <Button label="Send reset link" onPress={submit} loading={loading} disabled={!isConfigured} />
          </View>
        )}
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Link href="/(auth)/sign-in" style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>
            Return to sign in
          </Link>
        </View>
      </KeyboardAwareScrollViewCompat>
    </Screen>
  );
}