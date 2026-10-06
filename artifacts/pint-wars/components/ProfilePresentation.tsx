import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { profileColors as c, type ProfileStyles } from './ProfileStyles';

type Icon = React.ComponentProps<typeof Feather>['name'];

export function ProfileHeader({ s }: { s: ProfileStyles }) {
  return (
    <View style={s.header}>
      <View style={s.brand} accessible accessibilityLabel="Pint Wars">
        <Image source={require('@/assets/images/wars/pw-wars-crest.png')} style={s.crest} resizeMode="contain" />
        <Image source={require('@/assets/images/wars/pw-wars-wordmark.png')} style={s.wordmark} resizeMode="contain" />
      </View>
      <Text style={s.headerLabel}>MEMBER PROFILE</Text>
    </View>
  );
}

export function ProfileIdentity({ name, email, avatarUrl, s }: { name: string; email?: string; avatarUrl?: string | null; s: ProfileStyles }) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  useEffect(() => setAvatarFailed(false), [avatarUrl]);
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return (
    <LinearGradient colors={[c.raised, c.cardEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.card}>
      <View style={s.ornament} pointerEvents="none" />
      <View style={s.avatarWrap}>
        {avatarUrl && !avatarFailed ? (
          <Image source={{ uri: avatarUrl }} style={s.avatar} onError={() => setAvatarFailed(true)} accessibilityLabel="Your profile photo" />
        ) : (
          <View style={s.avatar} accessibilityLabel="Profile initials"><Text style={s.initials}>{initials}</Text></View>
        )}
        <View style={s.seal} accessible={false}><Feather name="star" size={12} color={c.ink} /></View>
      </View>
      <View style={s.identity}>
        <Text style={s.kicker}>GOOD TO HAVE YOU HERE</Text>
        <Text style={s.name} numberOfLines={1} testID="profile-display-name">{name}</Text>
        {email ? <Text style={s.email} numberOfLines={1}>{email}</Text> : null}
      </View>
    </LinearGradient>
  );
}

export function ProfileStats({ wars, pints, pubs, s }: { wars: number | null; pints: number | null; pubs: number | null; s: ProfileStyles }) {
  const stats = [{ label: 'WARS PLAYED', value: wars }, { label: 'PASSPORT PINTS', value: pints }, { label: 'PUBS VISITED', value: pubs }];
  return (
    <View style={s.stats} accessibilityLabel="Your personal summary">
      {stats.map(({ label, value }, index) => (
        <View key={label} style={[s.stat, index < 2 && s.statDivider]}>
          <Text style={s.number} testID={`profile-stat-${index}`}>{value ?? '—'}</Text>
          <Text style={s.statLabel}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

export function ProfileSectionHeading({ title, aside, s }: { title: string; aside: string; s: ProfileStyles }) {
  return <View style={s.sectionHeading}><Text style={s.sectionTitle}>{title}</Text><Text style={s.sectionAside}>{aside}</Text></View>;
}

export function ProfileRow({ icon, title, subtitle, onPress, comingSoon, quiet, danger, last, testID, s }: {
  icon: Icon; title: string; subtitle?: string; onPress?: () => void; comingSoon?: boolean;
  quiet?: boolean; danger?: boolean; last?: boolean; testID?: string; s: ProfileStyles;
}) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={comingSoon ? `${title}, coming soon` : title}
      accessibilityState={{ disabled: Boolean(comingSoon) }} disabled={comingSoon} onPress={onPress}
      style={({ pressed }) => [s.row, !last && s.rowBorder, pressed && s.rowPressed]}>
      <View style={[s.rowIcon, quiet && s.quietIcon]}><Feather name={icon} size={15} color={danger ? c.danger : quiet ? c.muted : c.lightGold} /></View>
      <View style={s.rowCopy}><Text style={[s.rowTitle, danger && s.danger]}>{title}</Text>
        {subtitle ? <Text style={s.rowSubtitle} numberOfLines={1}>{subtitle}</Text> : null}</View>
      {comingSoon ? <View style={s.coming}><Text style={s.comingLabel}>COMING SOON</Text></View> : <Feather name="chevron-right" size={16} color={c.secondary} />}
    </Pressable>
  );
}

export function ProfileAction({ label, onPress, disabled, loading, quiet, danger, testID, s }: {
  label: string; onPress: () => void; disabled?: boolean; loading?: boolean;
  quiet?: boolean; danger?: boolean; testID?: string; s: ProfileStyles;
}) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ disabled: Boolean(disabled || loading), busy: loading }}
      disabled={disabled || loading} onPress={onPress}
      style={({ pressed }) => [s.action, quiet && s.quietAction, danger && s.dangerAction, (disabled || loading || pressed) && s.disabled]}>
      {loading ? <ActivityIndicator color={danger ? c.danger : quiet ? c.paper : c.ink} /> :
        <Text style={[s.actionLabel, quiet && s.quietActionLabel, danger && s.danger]}>{label}</Text>}
    </Pressable>
  );
}

export function ProfileDialog({ visible, title, onClose, busy, children, s }: {
  visible: boolean; title: string; onClose: () => void; busy?: boolean; children: React.ReactNode; s: ProfileStyles;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
      <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.sheet} accessibilityViewIsModal>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.sheetContent}>
            <View style={s.sheetHeading}>
              <Text style={s.sheetTitle} accessibilityRole="header">{title}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Close ${title}`} disabled={busy} onPress={onClose} style={s.close}>
                <Feather name="x" size={20} color={c.paper} />
              </Pressable>
            </View>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
