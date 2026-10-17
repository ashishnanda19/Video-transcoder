"use client";

import { ContactLine, H2, LegalLayout, P, UL } from "@/components/LegalLayout";
import { useConfig } from "@/hooks/useConfig";

export default function TermsPage() {
  const { retentionDays, maxUploadMb, dailyUploadsPerUser } = useConfig();
  return (
    <LegalLayout title="Terms of Service" updated="17 October 2026">
      <P>By signing in to or using VidFlow you agree to these terms. If you do not agree, please do not use the service.</P>

      <H2>The service</H2>
      <P>
        VidFlow converts a video you upload into several resolutions and lets you preview and download them. It is provided free of
        charge by an individual, on a best-effort basis.
      </P>

      <H2>Your content</H2>
      <UL>
        <li>You keep all rights to the videos you upload. You give VidFlow permission to store and process them only to provide the service to you.</li>
        <li>Only upload content you have the right to use.</li>
        <li>Do not upload anything illegal, infringing, abusive, or harmful, including malware and any content that exploits or endangers minors. We may remove such content and block the account without notice.</li>
      </UL>

      <H2>Fair use and limits</H2>
      <UL>
        <li>Files up to {maxUploadMb} MB, up to {dailyUploadsPerUser} uploads per day per account, and a limited number of videos processed at once.</li>
        {retentionDays > 0 && <li>Videos are deleted automatically {retentionDays} days after upload. Download what you need before then.</li>}
        <li>The service also has an overall daily capacity; when it is reached uploads pause until the next day.</li>
        <li>Do not attempt to bypass limits, probe or attack the service, or use automation to upload in bulk.</li>
      </UL>

      <H2>No warranty</H2>
      <P>
        VidFlow is provided &ldquo;as is&rdquo;, without warranties of any kind. It may be slow, unavailable, changed or shut down at any time,
        and files can be lost. Keep your own copy of anything important.
      </P>

      <H2>Liability</H2>
      <P>
        To the extent the law allows, the site owner is not liable for any loss or damage arising from your use of, or inability to use,
        the service, including loss of files.
      </P>

      <H2>Ending your use</H2>
      <P>You can stop at any time and delete your videos. Access may be suspended for anyone who breaks these terms.</P>

      <H2>Privacy and contact</H2>
      <P>How your data is handled is described in the Privacy Policy. Questions: <ContactLine />.</P>
    </LegalLayout>
  );
}
