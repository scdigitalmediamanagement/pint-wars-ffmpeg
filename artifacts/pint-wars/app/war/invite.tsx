import React, { useEffect, useState } from 'react';
import { Share, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Button, Card, Screen, Title, uiStyles } from '@/components/AppUi';
import { createLeagueInvite } from '@/src/lib/league-service';
import { useColors } from '@/hooks/useColors';

export default function InviteScreen() {
  const colors = useColors();
  const { leagueId, code } = useLocalSearchParams<{ leagueId: string; code: string }>();
  const [shared, setShared] = useState(false);
  const [inviteCode, setInviteCode] = useState(typeof code === 'string' ? code : '');
  const inviteMutation = useMutation({
    mutationFn: () => createLeagueInvite(leagueId as string),
    onSuccess: (result) => setInviteCode(result.invite_code),
  });

  useEffect(() => {
    if (!inviteCode && leagueId) inviteMutation.mutate();
  }, [inviteCode, leagueId]);

  async function shareInvite() {
    const inviteLink = `pint-wars://invite/${inviteCode}`;
    await Share.share({
      message: `Join my Pint War on Pint Wars. Use invite code ${inviteCode} or open ${inviteLink}`,
    });
    setShared(true);
  }

  return (
    <Screen>
      <View style={[uiStyles.content, { paddingTop: 58, gap: 24 }]}>
        <Title eyebrow="Your war is live">Bring in your crew</Title>
        <Card style={{ gap: 18, alignItems: 'center' }}>
          <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }}>INVITE CODE</Text>
          <Text selectable style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 44, letterSpacing: 7 }}>
            {inviteMutation.isPending ? '······' : inviteCode}
          </Text>
          <Text style={{ color: colors.mutedForeground, textAlign: 'center', fontFamily: 'Inter_400Regular', lineHeight: 21 }}>
            Share this code with up to 3 friends. They will join your free 4-player Pint War.
          </Text>
        </Card>
        <Button label={shared ? 'Invite shared' : 'Share invite'} variant="secondary" onPress={shareInvite} disabled={!inviteCode || inviteMutation.isPending} />
        <Button label="Open league dashboard" onPress={() => router.replace(`/war/${leagueId}`)} />
      </View>
    </Screen>
  );
}