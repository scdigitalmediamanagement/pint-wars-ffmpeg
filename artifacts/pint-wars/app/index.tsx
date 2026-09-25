import React, { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/src/providers/AuthProvider';
import { useColors } from '@/hooks/useColors';

export default function EntryScreen() {
  const { session, isLoading } = useAuth();
  const colors = useColors();

  useEffect(() => {
    if (!isLoading) {
      router.replace(session ? '/(tabs)' : '/(auth)/sign-in');
    }
  }, [isLoading, session]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, gap: 12 }}>
      <ActivityIndicator color={colors.accent} />
      <Text style={{ color: colors.mutedForeground }}>Loading Pint Wars</Text>
    </View>
  );
}