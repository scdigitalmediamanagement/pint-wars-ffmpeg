import React from 'react';
import { Platform } from 'react-native';
import {
  PublicBullet,
  PublicInfoPage,
  PublicParagraph,
  PublicSection,
  SupportEmailLink,
} from '@/components/PublicInfo';
import AccountDeletionRequest from '@/components/AccountDeletionRequest';

export default function DeleteAccountScreen() {
  return (
    <PublicInfoPage title="Account Deletion" eyebrow="Pint Wars · Your account">
      <PublicParagraph>
        In the app, open Profile → Delete Account. If you cannot use the app, use the public Account Deletion web page to verify access to your account email and request deletion.
      </PublicParagraph>
      <PublicParagraph>
        The web form sends a one-time email code. It does not create accounts or disclose whether an email address is registered. After verification, you must separately confirm permanent deletion.
      </PublicParagraph>

      {Platform.OS === 'web' ? (
        <PublicSection title="Request deletion online">
          <AccountDeletionRequest />
        </PublicSection>
      ) : null}

      <PublicSection title="What happens">
        <PublicBullet>
          Your Supabase Auth account and sign-in email are deleted. Pint-proof files are removed; photo hashes and personal visit coordinates are cleared from pint logs.
        </PublicBullet>
        <PublicBullet>
          Your profile link is removed. Historical league memberships, scores, and host attribution remain under a new generic “Deleted player” profile; score values are not changed. Your authored reviews, reports, and notifications are deleted.
        </PublicBullet>
        <PublicBullet>
          Purchase verification records may remain in anonymized form to preserve purchase and league integrity. Pint Wars requests permanent deletion of the associated RevenueCat customer using your Supabase user ID. RevenueCat processes that request asynchronously. Third-party records may be retained where legally or business-required; the current project does not define fixed retention periods.
        </PublicBullet>
        <PublicBullet>
          Deletion is blocked while you host an active Pint War. The app will not end a league for you. Finish it or use its existing “End Pint War Early” control, then try again.
        </PublicBullet>
      </PublicSection>

      <PublicSection title="Need help?">
        <PublicParagraph>
          If you cannot access the app or have a question about deletion or retained records, contact:
        </PublicParagraph>
        <SupportEmailLink subject="Pint Wars account deletion help" />
      </PublicSection>
    </PublicInfoPage>
  );
}