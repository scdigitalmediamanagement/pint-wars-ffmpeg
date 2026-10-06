import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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

export default function CreateAccountScreen() {
  const { signUp, isConfigured } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const displayNameInputRef = useRef<TextInput>(null);
  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);

  async function submit() {
    setError('');
    setMessage('');
    if (!displayName.trim() || !email.trim() || password.length < 6) {
      setError('Add a display name, a valid email, and a password with at least 6 characters.');
      return;
    }
    try {
      setLoading(true);
      displayNameInputRef.current?.blur();
      emailInputRef.current?.blur();
      passwordInputRef.current?.blur();
      const result = await signUp(email, password, displayName);
      if (result.needsEmailConfirmation) {
        setMessage('Account created. Check your email to confirm your account, then sign in.');
      } else {
        router.replace('/(tabs)');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create your account.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScreen contentStyle={styles.content}>
      <View style={styles.page}>
        <View style={styles.inner}>
          <View accessible={false} style={styles.ornament}>
            <View style={styles.ornamentLine} />
            <View style={styles.ornamentMark}>
              <Ionicons name="trophy-outline" size={15} color={authColors.gold} />
            </View>
            <View style={styles.ornamentLine} />
          </View>

          <View style={styles.heading}>
            <Text style={styles.eyebrow}>Start your record</Text>
            <Text style={styles.title}>
              Make your first{'\n'}
              <Text style={styles.titleAccent}>war count.</Text>
            </Text>
          </View>

          {!isConfigured ? (
            <AuthNotice variant="error">
              Supabase is not configured. Add the authentication environment variables to continue.
            </AuthNotice>
          ) : null}

          <View style={styles.form}>
            <AuthField
              ref={displayNameInputRef}
              label="Display name"
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="How your mates will see you"
              autoComplete="name"
              returnKeyType="next"
            />
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
              autoComplete="new-password"
              placeholder="At least 6 characters"
              returnKeyType="done"
              onSubmitEditing={submit}
            />
            {error ? <AuthNotice variant="error">{error}</AuthNotice> : null}
            {message ? <AuthNotice variant="success">{message}</AuthNotice> : null}
            <AuthButton
              label="Create account"
              onPress={submit}
              loading={loading}
              disabled={!isConfigured}
              layout="spread"
              iconBox
              icon={<Ionicons name="arrow-forward" size={17} color="#17140a" />}
            />
          </View>

          <View style={styles.signinPrompt}>
            <Text style={styles.signinText}>Already have an account?</Text>
            <Link href="/(auth)/sign-in" asChild>
              <Pressable
                accessibilityRole="link"
                style={({ pressed }) => pressed && styles.linkPressed}
              >
                <Text style={styles.signinLink}>Sign in</Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 22,
    paddingTop: 20,
  },
  page: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  inner: {
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
  },
  ornament: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 11,
    marginTop: 7,
    marginBottom: 17,
  },
  ornamentLine: {
    width: 48,
    height: StyleSheet.hairlineWidth,
    backgroundColor: authColors.gold,
    opacity: 0.5,
  },
  ornamentMark: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 209, 46, 0.38)',
    borderRadius: 9,
    backgroundColor: 'rgba(255, 209, 46, 0.07)',
    transform: [{ rotate: '45deg' }],
  },
  heading: {
    alignItems: 'center',
    marginBottom: 25,
  },
  eyebrow: {
    marginBottom: 9,
    color: authColors.gold,
    fontFamily: 'DMSans_700Bold',
    fontSize: 10,
    letterSpacing: 1.9,
    lineHeight: 13,
    textTransform: 'uppercase',
  },
  title: {
    color: authColors.text,
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 34,
    letterSpacing: -1.8,
    lineHeight: 35,
    textAlign: 'center',
  },
  titleAccent: {
    color: authColors.gold,
    fontFamily: 'SpaceGrotesk_700Bold',
  },
  form: {
    gap: 15,
  },
  signinPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 23,
  },
  signinText: {
    color: authColors.muted,
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  signinLink: {
    color: authColors.gold,
    fontFamily: 'DMSans_700Bold',
    fontSize: 12,
    textDecorationLine: 'underline',
    textDecorationColor: 'rgba(255, 209, 46, 0.42)',
  },
  linkPressed: {
    opacity: 0.7,
  },
});