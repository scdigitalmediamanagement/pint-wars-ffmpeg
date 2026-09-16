import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, ErrorText, Field, Screen, Title, uiStyles } from '@/components/AppUi';
import { createFreeLeague } from '@/src/lib/league-service';
import { useColors } from '@/hooks/useColors';

export default function CreateWarScreen() {
  const colors = useColors();
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const mutation = useMutation({
    mutationFn: () => createFreeLeague(name),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ['my-leagues'] });
      router.replace({ pathname: '/war/invite', params: { leagueId: result.league_id, code: result.invite_code } });
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Could not create your war.'),
  });

  return (
    <Screen>
      <ScrollView contentContainerStyle={[uiStyles.content, { paddingTop: 28, gap: 24 }]} keyboardShouldPersistTaps="handled">
        <Title eyebrow="New competition">Create a Pint War</Title>
        <Card style={{ gap: 16 }}>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', lineHeight: 22 }}>
            Your free war is for up to 8 players and starts as soon as it is created. The league runs for 30 days.
          </Text>
          <Field label="League name" value={name} onChangeText={setName} placeholder="Exmouth Pint Wars" maxLength={80} autoFocus />
          {error ? <ErrorText>{error}</ErrorText> : null}
          <Button label="Create free war" onPress={() => mutation.mutate()} loading={mutation.isPending} disabled={!name.trim()} />
        </Card>
        <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', lineHeight: 21 }}>
          Stage 1 supports the free 8-player league only. Paid league sizes and payments are intentionally not available yet.
        </Text>
      </ScrollView>
    </Screen>
  );
}