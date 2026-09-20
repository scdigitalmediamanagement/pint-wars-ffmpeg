import React, { useState } from 'react';
import { Keyboard, Text, TextInput, View } from 'react-native';
import { Link, router } from 'expo-router';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { Button, ErrorText, Field, Screen, Title, uiStyles } from '@/components/AppUi';
import { useAuth } from '@/src/providers/AuthProvider';
import { useColors } from '@/hooks/useColors';

export default function CreateAccountScreen() {
  const colors = useColors();
  const { signUp, isConfigured } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError('');
    setMessage('');
    if (!displayName.trim() || !email.trim() || password.length < 6) {
      setError('Add a display name, a valid email, and a password with at least 6 characters.');
      return;
    }
    try {
      setLoading(true);
      const result = await signUp(email, password, displayName);
      if (result.needsEmailConfirmation) {
        setMessage('Account created. Check your email to confirm your account, then sign in.');
      } else {
        const focusedInput = TextInput.State.currentlyFocusedInput();
        if (focusedInput) {
          TextInput.State.blurTextInput(focusedInput);
        }
        Keyboard.dismiss();
        router.replace('/(tabs)');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create your account.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <KeyboardAwareScrollViewCompat contentContainerStyle={[uiStyles.content, { paddingTop: 68, gap: 24 }]}>
        <Title eyebrow="Start your record">Make your first war count.</Title>
        <View style={{ gap: 15 }}>
          <Field label="Display name" value={displayName} onChangeText={setDisplayName} placeholder="How your mates will see you" autoComplete="name" />
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
          {error ? <ErrorText>{error}</ErrorText> : null}
          {message ? <Text style={{ color: colors.primary, fontFamily: 'Inter_500Medium', lineHeight: 21 }}>{message}</Text> : null}
          <Button label="Create account" onPress={submit} loading={loading} disabled={!isConfigured} />
        </View>
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Text style={{ color: colors.mutedForeground }}>Already have an account?</Text>
          <Link href="/(auth)/sign-in" style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Sign in</Link>
        </View>
      </KeyboardAwareScrollViewCompat>
    </Screen>
  );
}