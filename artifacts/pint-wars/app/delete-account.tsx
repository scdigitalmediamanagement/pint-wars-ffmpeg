import React from 'react';
import {
  PublicBullet,
  PublicInfoPage,
  PublicParagraph,
  PublicSection,
  SupportEmailLink,
} from '@/components/PublicInfo';

export default function DeleteAccountScreen() {
  return (
    <PublicInfoPage title="Account Deletion" eyebrow="Pint Wars · Your account">
      <PublicParagraph>
        You can request account deletion in the Pint Wars app: open Profile, select Delete Account, review the permanent-deletion warning, and confirm.
      </PublicParagraph>
      <PublicParagraph>
        The app sends an authenticated POST request to /api/account/delete. This endpoint requires a valid signed-in session; it is not an unauthenticated web link or browser form.
      </PublicParagraph>

      <PublicSection title="What happens">
        <PublicBullet>
          Pint-proof files are removed from storage. Photo hashes and personal visit coordinates are cleared from pint logs.
        </PublicBullet>
        <PublicBullet>
          Your profile display name changes to “Deleted player,” your authored reviews and notifications are deleted, and active invites you created are revoked.
        </PublicBullet>
        <PublicBullet>
          Sign-in is blocked and the Supabase Auth user metadata is cleared. The current process retains the Supabase Auth record and its email address, the stable user ID, historical league and score records, purchase records, and some historical invite/audit records.
        </PublicBullet>
        <PublicBullet>
          The deletion request is blocked while you host an active Pint War. Finish or end that league before trying again.
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