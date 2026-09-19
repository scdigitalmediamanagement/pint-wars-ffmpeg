import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useAuth } from '@/src/providers/AuthProvider';
import { useColors } from '@/hooks/useColors';

export default function AuthCallbackScreen() {
  const colors = useColors();
  const { establishRecoverySession } = useAuth();
  const [error, setError] = useState('');
  const handledUrl = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function handleUrl(url: string) {
      if (handledUrl.current === url) return;
      handledUrl.current = url;
      try {
        await establishRecoverySession(url);
        if (mounted) router.replace('/(auth)/reset-password');
      } catch {
        if (mounted) setError('This reset link has expired or is no longer valid. Request a new one to continue.');
      }
    }

    Linking.getInitialURL().then((url) => {
      if (url) void handleUrl(url);
    });
    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handleUrl(url);
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [establishRecoverySession]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: 24, gap: 14 }}>
      {error ? (
        <>
          <Text style={{ color: colors.destructive, fontFamily: 'Inter_500Medium', textAlign: 'center', lineHeight: 21 }}>
            {error}
          </Text>
          <Text
            accessibilityRole="link"
            onPress={() => router.replace('/(auth)/forgot-password')}
            style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}
          >
            Request a new reset link
          </Text>
        </>
      ) : (
        <>
          <ActivityIndicator color={colors.accent} />
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>
            Preparing your password reset…
          </Text>
        </>
      )}
    </View>
  );
}