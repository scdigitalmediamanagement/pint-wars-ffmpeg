import React from 'react';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Screen, Title, uiStyles } from '@/components/AppUi';
import { useColors } from '@/hooks/useColors';

export const SUPPORT_EMAIL = 'scdigitalmediamanagement@gmail.com';

const publicLinks = [
  { label: 'Privacy Policy', route: '/privacy', testID: 'public-privacy-link' },
  { label: 'Support', route: '/support', testID: 'public-support-link' },
  { label: 'Account Deletion', route: '/delete-account', testID: 'public-delete-account-link' },
] as const;

export function PublicInfoPage({
  title,
  eyebrow = 'Pint Wars',
  children,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  const colors = useColors();

  return (
    <Screen>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          uiStyles.content,
          styles.content,
          {
            paddingTop: Platform.OS === 'web' ? 67 : 22,
            paddingBottom: Platform.OS === 'web' ? 34 : 40,
          },
        ]}
      >
        <Title eyebrow={eyebrow}>{title}</Title>
        <View style={styles.sections}>{children}</View>
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <Text style={[styles.footerTitle, { color: colors.mutedForeground }]}>Pint Wars information</Text>
          <View style={styles.links}>
            {publicLinks.map((link) => (
              <Pressable
                key={link.route}
                accessibilityRole="link"
                onPress={() => router.push(link.route)}
                testID={link.testID}
              >
                <Text style={[styles.link, { color: colors.primary }]}>{link.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

export function PublicSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const colors = useColors();

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export function PublicParagraph({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return <Text style={[styles.paragraph, { color: colors.mutedForeground }]}>{children}</Text>;
}

export function PublicBullet({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.bulletRow}>
      <Text style={[styles.bullet, { color: colors.accent }]}>•</Text>
      <Text style={[styles.paragraph, styles.bulletText, { color: colors.mutedForeground }]}>{children}</Text>
    </View>
  );
}

export function SupportEmailLink({
  subject = 'Pint Wars support request',
}: {
  subject?: string;
}) {
  const colors = useColors();
  const href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Email ${SUPPORT_EMAIL}`}
      onPress={() => {
        void Linking.openURL(href).catch(() => undefined);
      }}
      testID="support-email-link"
    >
      <Text selectable style={[styles.email, { color: colors.primary }]}>{SUPPORT_EMAIL}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 780,
    gap: 18,
  },
  sections: { gap: 22 },
  section: { gap: 8 },
  sectionTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    lineHeight: 24,
  },
  sectionBody: { gap: 9 },
  paragraph: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    lineHeight: 23,
  },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bullet: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
    lineHeight: 23,
  },
  bulletText: { flex: 1 },
  email: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    lineHeight: 24,
    textDecorationLine: 'underline',
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 16,
    gap: 10,
  },
  footerTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  link: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    lineHeight: 22,
    textDecorationLine: 'underline',
  },
});