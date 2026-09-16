import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useColors } from '@/hooks/useColors';

export default function InviteLinkScreen() {
  const colors = useColors();
  const { code } = useLocalSearchParams<{ code: string }>();

  useEffect(() => {
    if (code) router.replace({ pathname: '/war/join', params: { code } });
  }, [code]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}