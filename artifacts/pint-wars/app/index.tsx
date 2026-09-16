import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/src/providers/AuthProvider';
import { useColors } from '@/hooks/useColors';

export default function EntryScreen() {
  const { session, isLoading } = useAuth();
  const colors = useColors();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, gap: 12 }}>
        <ActivityIndicator color={colors.accent} />
        <Text style={{ color: colors.mutedForeground }}>Loading Pint Wars</Text>
      </View>
    );
  }

  return <Redirect href={session ? '/(tabs)' : '/(auth)/sign-in'} />;
}