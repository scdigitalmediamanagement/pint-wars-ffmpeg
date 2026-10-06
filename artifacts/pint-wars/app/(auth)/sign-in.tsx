import React, { useRef, useState } from 'react';
import { Pressable, Text, TextInput, View, StyleSheet } from 'react-native';
import { Link, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  AuthButton,
  AuthField,
  AuthNotice,
  AuthScreen,
  authColors,
} from '@/components/AuthUi';
import { useAuth } from '@/src/providers/AuthProvider';

export default function SignInScreen() {
  const { signIn, isConfigured } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);

  async function submit() {
    setError('');
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    try {
      setLoading(true);
      emailInputRef.current?.blur();
      passwordInputRef.current?.blur();
      await signIn(email, password);
      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScreen contentStyle={styles.content}>
      <View style={styles.page}>
        <View style={styles.main}>
          <View style={styles.intro}>
            <View
              accessible={false}
              style={styles.kicker}
            >
              <View style={styles.kickerPrimary} />
              <View style={styles.kickerSecondary} />
              <View style={styles.kickerTertiary} />
            </View>
            <Text style={styles.title}>
              Bring your mates.{'\n'}Chase the leaderboard.
            </Text>
            <Text style={styles.subtitle}>
              Create a private Pint War, invite your friends, and make every pint count.
            </Text>
          </View>

          {!isConfigured ? (
            <AuthNotice variant="error">
              Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to run authentication.
            </AuthNotice>
          ) : null}

          <View style={styles.form}>
            <AuthField
              ref={emailInputRef}
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              placeholder="you@example.com"
              returnKeyType="next"
            />
            <AuthField
              ref={passwordInputRef}
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              placeholder="Enter your password"
              returnKeyType="done"
              onSubmitEditing={submit}
            />
            <Link href="/(auth)/forgot-password" asChild>
              <Pressable
                accessibilityRole="link"
                style={({ pressed }) => [
                  styles.forgotLink,
                  pressed && styles.linkPressed,
                ]}
              >
                <Text style={styles.forgotLinkText}>Forgot password?</Text>
              </Pressable>
            </Link>
            {error ? <AuthNotice variant="error">{error}</AuthNotice> : null}
            <AuthButton
              label="Sign in"
              onPress={submit}
              loading={loading}
              disabled={!isConfigured}
              icon={<Ionicons name="arrow-forward" size={18} color="#17140a" />}
            />
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>New to Pint Wars?</Text>
          <Link href="/(auth)/create-account" asChild>
            <Pressable
              accessibilityRole="link"
              style={({ pressed }) => pressed && styles.linkPressed}
            >
              <Text style={styles.footerLink}>Create an account</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 22,
    paddingTop: 31,
  },
  page: {
    flexGrow: 1,
    justifyContent: 'space-between',
  },
  main: {
    gap: 22,
  },
  intro: {
    paddingTop: 5,
    paddingBottom: 1,
  },
  kicker: {
    width: 33,
    height: 4,
    flexDirection: 'row',
    gap: 3,
    marginBottom: 17,
  },
  kickerPrimary: {
    width: 18,
    height: 4,
    borderRadius: 3,
    backgroundColor: authColors.gold,
  },
  kickerSecondary: {
    width: 7,
    height: 4,
    borderRadius: 3,
    backgroundColor: authColors.gold,
    opacity: 0.62,
  },
  kickerTertiary: {
    width: 4,
    height: 4,
    borderRadius: 3,
    backgroundColor: authColors.gold,
    opacity: 0.32,
  },
  title: {
    color: authColors.text,
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 27,
    letterSpacing: -1.25,
    lineHeight: 31,
  },
  subtitle: {
    maxWidth: 310,
    marginTop: 13,
    color: authColors.muted,
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    lineHeight: 20,
  },
  form: {
    gap: 16,
    paddingTop: 2,
  },
  forgotLink: {
    alignSelf: 'flex-end',
    marginTop: -3,
    paddingVertical: 2,
  },
  forgotLinkText: {
    color: authColors.gold,
    fontFamily: 'DMSans_700Bold',
    fontSize: 12,
  },
  footer: {
    alignItems: 'center',
    gap: 8,
    marginTop: 'auto',
    paddingTop: 27,
    paddingBottom: 12,
  },
  footerText: {
    color: authColors.muted,
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
  },
  footerLink: {
    color: authColors.gold,
    fontFamily: 'DMSans_700Bold',
    fontSize: 13,
  },
  linkPressed: {
    opacity: 0.7,
  },
});