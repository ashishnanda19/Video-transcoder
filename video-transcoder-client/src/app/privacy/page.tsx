"use client";

import { ContactLine, H2, LegalLayout, P, UL } from "@/components/LegalLayout";
import { useConfig } from "@/hooks/useConfig";

export default function PrivacyPage() {
  const { retentionDays, maxUploadMb } = useConfig();
  return (
    <LegalLayout title="Privacy Policy" updated="17 October 2026">
      <P>
        VidFlow is a small video-transcoding service run by an individual. This page explains what it stores about you, why,
        and how to remove it. It is written to be read, not to hide anything.
      </P>

      <H2>What we collect</H2>
      <UL>
        <li><strong className="text-foreground">From Google sign-in:</strong> your name, email address and profile picture. Used only to identify your account and show it back to you.</li>
        <li><strong className="text-foreground">Your videos:</strong> the files you upload (up to {maxUploadMb} MB each) and the resized versions we produce from them, plus the file name, size, upload time and processing status.</li>
        <li><strong className="text-foreground">One cookie:</strong> a session cookie that keeps you signed in. It is strictly necessary, expires after 14 days of inactivity, and is not used for tracking.</li>
      </UL>
      <P>We do not use analytics, advertising or tracking cookies, and we do not sell or share your data for marketing.</P>

      <H2>Who handles your data</H2>
      <UL>
        <li><strong className="text-foreground">Google</strong> authenticates you (sign-in only).</li>
        <li><strong className="text-foreground">Amazon Web Services</strong> (Mumbai, India) stores and processes your videos.</li>
        <li><strong className="text-foreground">MongoDB Atlas</strong> stores account and video records.</li>
        <li><strong className="text-foreground">Upstash</strong> holds a short-lived processing queue (video ids and file names).</li>
        <li><strong className="text-foreground">Vercel</strong> serves this website and forwards requests to the service.</li>
      </UL>
      <P>
        Your videos are private to your account: they can only be played or downloaded while you are signed in, through short-lived
        links. The site owner has technical access to the infrastructure but does not browse your content, except where needed to fix a fault or deal with abuse.
      </P>

      <H2>How long we keep it</H2>
      <UL>
        {retentionDays > 0 ? (
          <li>Videos and their renditions are <strong className="text-foreground">deleted automatically {retentionDays} days after upload</strong>.</li>
        ) : (
          <li>Videos are kept until you delete them.</li>
        )}
        <li>You can delete any video yourself, at any time, from your library. That removes the renditions and the record immediately.</li>
        <li>The original upload is removed as soon as processing finishes.</li>
        <li>Your account record (name, email) is kept until you ask us to delete it.</li>
      </UL>

      <H2>Your choices</H2>
      <UL>
        <li>Delete your videos in the app, or ask for your account and all remaining data to be deleted by contacting <ContactLine />.</li>
        <li>Withdraw VidFlow&apos;s access to your Google account at any time at <span className="text-foreground">myaccount.google.com/permissions</span>.</li>
      </UL>

      <H2>Google user data</H2>
      <P>
        VidFlow&apos;s use of information received from Google APIs adheres to the Google API Services User Data Policy, including the
        Limited Use requirements. We only read your basic profile (name, email, picture) to sign you in.
      </P>

      <H2>Children</H2>
      <P>VidFlow is not directed at children under 13 and we do not knowingly collect their data.</P>

      <H2>Changes and contact</H2>
      <P>If this policy changes the date above changes with it. Questions or requests: <ContactLine />.</P>
    </LegalLayout>
  );
}
