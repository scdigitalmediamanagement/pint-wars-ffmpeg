import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  AuthButton,
  AuthField,
  AuthNotice,
  AuthScreen,
  authColors,
} from '@/components/AuthUi';
import { useAuth } from '@/src/providers/AuthProvider';

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function ForgotPasswordScreen() {
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
    <AuthScreen contentStyle={styles.content}>
      <View style={styles.page}>
        <View style={styles.recoveryMark} accessible={false}>
          <View style={styles.orbit} />
          <View style={styles.coin}>
            <Ionicons name="mail-outline" size={25} color={authColors.actionInk} />
          </View>
          <View style={styles.sparkOne} />
          <View style={styles.sparkTwo} />
        </View>

        <View style={styles.heading}>
          <Text style={styles.eyebrow}>Account access</Text>
          <Text style={styles.title}>
            Reset your{'\n'}password
          </Text>
          <View style={styles.headingRule} />
          <Text style={styles.description}>
            Enter your email and we&apos;ll send instructions to create a new password.
          </Text>
        </View>

        {!isConfigured ? (
          <AuthNotice variant="error">
            Supabase is not configured. Add the authentication environment variables to continue.
          </AuthNotice>
        ) : null}

        {submitted ? (
          <AuthNotice variant="success">
            If an account exists for that email, we&apos;ll send you a password reset link.
          </AuthNotice>
        ) : (
          <View style={styles.form}>
            <AuthField
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              placeholder="you@example.com"
              editable={!loading}
              returnKeyType="done"
              onSubmitEditing={submit}
            />
            {error ? <AuthNotice variant="error">{error}</AuthNotice> : null}
            <AuthButton
              label="Send reset link"
              onPress={submit}
              loading={loading}
              disabled={!isConfigured}
              layout="centerInline"
              icon={<Ionicons name="arrow-forward" size={17} color={authColors.actionInk} />}
            />
          </View>
        )}

        <View style={styles.returnLink}>
          <Ionicons name="arrow-back" size={15} color={authColors.gold} />
          <Link href="/(auth)/sign-in" style={styles.returnLinkText}>
            Return to sign in
          </Link>
        </View>
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingTop: 27,
  },
  page: {
    flexGrow: 1,
  },
  recoveryMark: {
    width: 98,
    height: 98,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 3,
    marginBottom: 24,
  },
  orbit: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderWidth: 1,
    borderColor: 'rgba(255, 209, 46, 0.28)',
    borderRadius: 49,
    shadowColor: authColors.gold,
    shadowOpacity: 0.06,
    shadowRadius: 12,
  },
  coin: {
    width: 61,
    height: 61,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 235, 164, 0.72)',
    borderRadius: 31,
    backgroundColor: authColors.gold,
    shadowColor: authColors.gold,
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  sparkOne: {
    position: 'absolute',
    top: 8,
    right: 17,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ffe08a',
  },
  sparkTwo: {
    position: 'absolute',
    bottom: 14,
    left: 9,
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#ffe08a',
  },
  heading: {
    alignItems: 'center',
    paddingBottom: 23,
  },
  eyebrow: {
    marginBottom: 10,
    color: authColors.gold,
    fontFamily: 'DMSans_700Bold',
    fontSize: 10,
    letterSpacing: 1.9,
    lineHeight: 13,
    textTransform: 'uppercase',
  },
  title: {
    color: authColors.text,
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 34,
    letterSpacing: -1.8,
    lineHeight: 35,
    textAlign: 'center',
  },
  headingRule: {
    width: 43,
    height: StyleSheet.hairlineWidth,
    marginTop: 20,
    backgroundColor: authColors.gold,
    opacity: 0.6,
  },
  description: {
    maxWidth: 294,
    marginTop: 13,
    color: authColors.muted,
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    lineHeight: 21,
    textAlign: 'center',
  },
  form: {
    gap: 15,
    marginTop: 26,
  },
  returnLink: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    alignSelf: 'center',
    marginTop: 18,
    paddingHorizontal: 10,
  },
  returnLinkText: {
    color: authColors.gold,
    fontFamily: 'DMSans_700Bold',
    fontSize: 12,
  },
});