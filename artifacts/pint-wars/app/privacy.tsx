import React from 'react';
import {
  PublicBullet,
  PublicInfoPage,
  PublicParagraph,
  PublicSection,
  SupportEmailLink,
} from '@/components/PublicInfo';

export default function PrivacyPolicyScreen() {
  return (
    <PublicInfoPage title="Privacy Policy" eyebrow="Pint Wars · Privacy">
      <PublicParagraph>Effective date: September 26, 2026.</PublicParagraph>
      <PublicParagraph>
        This notice describes the information handled by the current Pint Wars app and its server features. It reflects the data fields and service integrations in the current project code.
      </PublicParagraph>

      <PublicSection title="Information the app handles">
        <PublicBullet>
          Account information: email address, Supabase user ID, and display name. Email and password authentication are handled by Supabase Auth. The app persists a Supabase sign-in session on your device so you can stay signed in.
        </PublicBullet>
        <PublicBullet>
          League and app activity: Pint War names, invite codes and status, memberships and roles, pint logs, timestamps, score history, and in-app notifications.
        </PublicBullet>
        <PublicBullet>
          Pub reviews: venue details, ratings, optional review text, timestamps, and review reports that include a reason. Signed-in users can see pub reviews and their associated display names; league participants can see league activity relevant to their league.
        </PublicBullet>
        <PublicBullet>
          Pint-proof photos: if you submit a proof photo, it is uploaded to a private Supabase Storage bucket under your user and league IDs. The server checks the stored object and records its path and a SHA-256 content hash with the pint log.
        </PublicBullet>
        <PublicBullet>
          Location: location access is optional. When you use nearby-pub features, the mobile app can read your current latitude and longitude in the foreground and send them to the Pint Wars server, which queries Google Places. If you attach a pub or location to a pint log, the visit coordinates and selected pub identity/details may be stored with that log. The current app code does not request background location.
        </PublicBullet>
        <PublicBullet>
          Purchases: for paid league capacity, the app uses Apple App Store or Google Play in-app purchases through RevenueCat. The app associates RevenueCat with your Supabase user ID. The server stores purchase provider, transaction and product IDs, capacity, price in pence, purchase/verification/consumption timestamps, and the linked league.
        </PublicBullet>
      </PublicSection>

      <PublicSection title="How information is used">
        <PublicParagraph>
          Pint Wars uses this information to sign you in, maintain your profile, create and run leagues, record and verify pint activity, calculate and preserve scores, show pub reviews and nearby venues, validate paid league purchases, deliver in-app notifications, and respond to messages you send to support.
        </PublicParagraph>
      </PublicSection>

      <PublicSection title="Services that process information">
        <PublicBullet>
          Supabase provides authentication, database, and private file storage for account, league, review, purchase, notification, and pint-proof data.
        </PublicBullet>
        <PublicBullet>
          RevenueCat processes in-app purchase customer and transaction information and sends verified purchase events to the Pint Wars server. Apple App Store and Google Play provide the corresponding in-app purchase flows.
        </PublicBullet>
        <PublicBullet>
          Google Places receives the coordinates submitted for nearby-pub searches and returns venue identifiers, names, addresses, and locations. Pint Wars renders its native map with react-native-maps, using the platform map provider (Apple Maps on iOS and Google Maps on Android by default). The current app source does not make a separate Google Maps web API request.
        </PublicBullet>
        <PublicBullet>
          If you email support, your email address and message are processed by the email service for the Gmail support address below so a response can be sent.
        </PublicBullet>
      </PublicSection>

      <PublicSection title="Visibility and access">
        <PublicParagraph>
          Your display name and participation may be visible to other members of your leagues. Pub review ratings and text are available to signed-in app users with the associated display name and venue information. The app uses Supabase authentication and access rules in its database and Storage migrations to restrict account-specific records and pint-proof files.
        </PublicParagraph>
      </PublicSection>

      <PublicSection title="Security">
        <PublicParagraph>
          App API requests use HTTPS and authenticated requests carry a Supabase sign-in token. The project defines database row-level policies and private Storage access rules. No system can guarantee absolute security; do not send passwords or sign-in codes by email.
        </PublicParagraph>
      </PublicSection>

      <PublicSection title="Retention and account deletion">
        <PublicParagraph>
          The current code does not define a fixed retention period or automatic expiry schedule for account, league, score, review, or purchase records.
        </PublicParagraph>
        <PublicParagraph>
          You can start account deletion from Profile in the app or from the public Account Deletion page after verifying access to your account email. The process deletes your Supabase Auth account, removes pint-proof files and personal visit coordinates, deletes your authored reviews, reports, and notifications, and revokes active invites. It cannot run while you host an active Pint War; the app will not end a league automatically.
        </PublicParagraph>
        <PublicParagraph>
          Historical league memberships, scores, host attribution, and purchase verification records may remain under a new generic “Deleted player” profile. The original account UUID is not retained in completed Pint Wars deletion records, and historical score values are not changed. No fixed retention period or automatic expiry schedule is defined in the current project.
        </PublicParagraph>
        <PublicParagraph>
          As part of account deletion, Pint Wars requests permanent deletion of the RevenueCat customer associated with your Supabase user ID. RevenueCat processes that request asynchronously, so provider-side erasure may continue after the Pint Wars deletion process completes. Third-party records may be retained where legally or business-required; the current project does not define fixed retention periods.
        </PublicParagraph>
        <PublicParagraph>
          For details or privacy-related help, email:
        </PublicParagraph>
        <SupportEmailLink subject="Pint Wars privacy request" />
      </PublicSection>

      <PublicSection title="Children and age information">
        <PublicParagraph>
          The current app does not ask for date of birth and has no age-verification or child-specific account flow. If you believe a child has provided personal information through Pint Wars, please contact us using the email above.
        </PublicParagraph>
      </PublicSection>

      <PublicSection title="Contact">
        <PublicParagraph>
          For privacy questions or requests, contact Pint Wars at:
        </PublicParagraph>
        <SupportEmailLink subject="Pint Wars privacy request" />
      </PublicSection>
    </PublicInfoPage>
  );
}