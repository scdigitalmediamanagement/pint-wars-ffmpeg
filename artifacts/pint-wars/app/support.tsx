import React from 'react';
import {
  PublicInfoPage,
  PublicParagraph,
  PublicSection,
  SupportEmailLink,
} from '@/components/PublicInfo';

export default function SupportScreen() {
  return (
    <PublicInfoPage title="Support" eyebrow="Pint Wars · Help">
      <PublicParagraph>
        For help with your Pint Wars account, leagues, pub reviews, location features, or privacy questions, email the support address below.
      </PublicParagraph>
      <PublicSection title="Contact support">
        <SupportEmailLink />
        <PublicParagraph>
          Include a short description of the issue and, if helpful, the email address used for your Pint Wars account. Do not include your password, sign-in codes, or payment card details.
        </PublicParagraph>
      </PublicSection>
      <PublicSection title="Account deletion">
        <PublicParagraph>
          You can start deletion from Profile in the app. Read the account deletion page for the steps and for details about the records that may be retained.
        </PublicParagraph>
        <SupportEmailLink subject="Pint Wars account deletion help" />
      </PublicSection>
    </PublicInfoPage>
  );
}