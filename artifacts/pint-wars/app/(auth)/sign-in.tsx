import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { Button, ErrorText, Field, Screen, Title, uiStyles } from '@/components/AppUi';
import { useAuth } from '@/src/providers/AuthProvider';
import { useColors } from '@/hooks/useColors';

export default function SignInScreen() {
  const colors = useColors();
  const { signIn, isConfigured } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError('');
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    try {
      setLoading(true);
      await signIn(email, password);
      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <KeyboardAwareScrollViewCompat contentContainerStyle={[uiStyles.content, { paddingTop: 84, gap: 22 }]}>
        <View style={{ gap: 10 }}>
          <Text style={{ color: colors.accent, fontFamily: 'Inter_700Bold', fontSize: 14, letterSpacing: 2 }}>PINT WARS</Text>
          <Title>Bring your mates. Chase the leaderboard.</Title>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 16, lineHeight: 24 }}>
            Create a private 30-day war, invite your friends, and make every pint count.
          </Text>
        </View>
        {!isConfigured ? (
          <ErrorText>Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to run authentication.</ErrorText>
        ) : null}
        <View style={{ gap: 15 }}>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
          {error ? <ErrorText>{error}</ErrorText> : null}
          <Button label="Sign in" onPress={submit} loading={loading} disabled={!isConfigured} />
        </View>
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Text style={{ color: colors.mutedForeground }}>New to Pint Wars?</Text>
          <Link href="/(auth)/create-account" style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Create an account</Link>
        </View>
      </KeyboardAwareScrollViewCompat>
    </Screen>
  );
}