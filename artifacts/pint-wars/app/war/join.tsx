import React, { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, ErrorText, Field, Screen, Title, uiStyles } from '@/components/AppUi';
import { joinLeagueByCode } from '@/src/lib/league-service';
import { useColors } from '@/hooks/useColors';

export default function JoinWarScreen() {
  const colors = useColors();
  const params = useLocalSearchParams<{ code?: string }>();
  const client = useQueryClient();
  const [code, setCode] = useState(typeof params.code === 'string' ? params.code : '');
  const [error, setError] = useState('');
  const mutation = useMutation({
    mutationFn: () => joinLeagueByCode(code),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ['my-leagues'] });
      router.replace(`/war/${result.league_id}`);
    },
    onError: (err) => {
      if (err instanceof Error) {
        setError(err.message);
        return;
      }
      const errorRecord = err as { message?: unknown };
      setError(typeof errorRecord.message === 'string' ? errorRecord.message : 'Could not join this war.');
    },
  });

  return (
    <Screen>
      <ScrollView contentContainerStyle={[uiStyles.content, { paddingTop: 28, gap: 24 }]} keyboardShouldPersistTaps="handled">
        <Title eyebrow="Join a competition">Join a Pint War</Title>
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', lineHeight: 22 }}>
          A friend can give you a 6-character invite code from their Pint War.
        </Text>
        <Field
          label="Invite code"
          value={code}
          onChangeText={(value) => {
            setCode(value.toUpperCase());
            setError('');
          }}
          autoCapitalize="characters"
          maxLength={6}
          placeholder="ABC123"
        />
        {error ? <ErrorText>{error}</ErrorText> : null}
        <Button label="Join Pint War" onPress={() => mutation.mutate()} loading={mutation.isPending} disabled={code.trim().length !== 6} />
      </ScrollView>
    </Screen>
  );
}