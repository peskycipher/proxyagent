import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How proxy-agent handles your data (NSW, Australia)",
};

export default function PrivacyPolicy() {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "80px 24px" }}>
      <h1 style={{ fontSize: 40, marginBottom: 8 }}>Privacy Policy</h1>
      <p className="muted" style={{ marginBottom: 40 }}>
        Last updated: September 26, 2026
      </p>

      <h2>Overview</h2>
      <p>
        proxy-agent (&quot;we&quot;, &quot;the service&quot;) is operated from
        New South Wales, Australia, and provides metered, uncensored AI chat.
        We collect the minimum data needed to run accounts, billing, and the
        chat itself. We do not sell your data, and we do not run third-party
        advertising or analytics scripts.
      </p>

      <h2>The law that applies</h2>
      <p>
        As a private-sector operator, our handling of your personal information
        is governed by the <em>Privacy Act 1988</em> (Cth) and the 13 Australian
        Privacy Principles (APPs). This policy is written with NSW users in
        mind, and we aim to meet the standards NSW residents expect, including
        those reflected in NSW privacy legislation. (The{" "}
        <em>Privacy and Personal Information Protection Act 1998</em> (NSW)
        applies directly to NSW government agencies rather than private
        businesses; we voluntarily align our practices with its spirit.)
      </p>
      <p>
        Where the APPs require your consent to collect, use, or disclose
        personal information, we seek consent that is informed, current, and
        specific to the purpose. By creating an account you consent to the
        collection, use, and storage of your information as described in this
        policy.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account details.</strong> Your email address, a password
          hash, and your prepaid time-credit balance. Passwords are stored only
          as salted scrypt hashes — never in plaintext.
        </li>
        <li>
          <strong>OAuth accounts.</strong> If you sign in with Google or
          GitHub, we receive your provider email address and account
          identifier. We only link a local account to an email the provider has
          verified. We never see or store your provider password.
        </li>
        <li>
          <strong>Usage and billing records.</strong> Prepaid purchases
          (amount, coin, gateway reference, status) and an append-only ledger
          of credit changes.
        </li>
        <li>
          <strong>Chat content.</strong> Your conversations — chat titles and
          message text — are stored so you can revisit them, along with the
          billed seconds for each message.
        </li>
        <li>
          <strong>Bot protection.</strong> Login and signup are protected by
          Cloudflare Turnstile. Turnstile runs on Cloudflare infrastructure; it
          may process a small amount of browser data to verify you are human.
          We do not receive advertising identifiers from it.
        </li>
      </ul>
      <p>
        We only collect personal information by lawful and fair means
        (APP 3) and only where it is reasonably necessary for the functions
        described above.
      </p>

      <h2>What we do not collect</h2>
      <ul>
        <li>
          Payment card details, billing addresses, or bank information.
          Purchases are prepaid in cryptocurrency through a hosted gateway; we
          receive only the payment reference and confirmed amount.
        </li>
        <li>Advertising identifiers, or third-party analytics/tracking data.</li>
        <li>
          Sensitive information (within the meaning of the Privacy Act) unless
          you choose to include it in your own chat messages.
        </li>
        <li>Your messages&apos; content is not shared with third-party services for training or profiling.</li>
      </ul>

      <h2>How your data is used and disclosed</h2>
      <p>
        Your account data is used to authenticate you, enforce your session,
        meter usage against your prepaid balance, and process purchases. Your
        chat messages are sent to the AI model to generate responses and are
        stored with your chat history. We do not use your messages to train
        models or to build advertising profiles.
      </p>
      <p>
        We do not use or disclose your personal information for direct
        marketing (APP 7), and we do not disclose it to overseas recipients
        except as described under &quot;Where your data lives&quot; below. If
        that ever changes, we will take reasonable steps (APP 8) to ensure the
        overseas recipient does not breach the APPs, and we will update this
        policy first.
      </p>

      <h2>Where your data lives</h2>
      <p>
        Account, billing, and chat data are stored in the service&apos;s own
        database on our server in Australia. The AI model runs on rented GPU
        infrastructure (Runpod); only the message content needed to generate a
        response is transmitted there, over an encrypted connection, and it is
        not retained by the model host beyond the request. We keep a record of
        which overseas recipients your data may transit and will name them on
        request.
      </p>

      <h2>Data quality and security</h2>
      <p>
        We take reasonable steps to keep the personal information we hold
        accurate, up to date, and complete (APP 10), and to protect it from
        misuse, interference, loss, and unauthorised access, modification, or
        disclosure (APP 11). Access to the database is restricted to the
        operator; passwords are salted and hashed; traffic is encrypted.
      </p>

      <h2>Data retention and deletion</h2>
      <p>
        You may request deletion of your account, chat history, and associated
        billing records at any time using the contact address below. Minimal
        purchase and ledger records may be retained where required for
        financial record-keeping or fraud prevention. We destroy or
        de-identify personal information once we no longer need it for a
        permitted purpose (APP 11.2), subject to those record-keeping
        requirements.
      </p>

      <h2>Cookies</h2>
      <p>
        We set only the cookies required for authentication (your session
        token and sign-in flow state). We do not set advertising or tracking
        cookies.
      </p>

      <h2>Your rights</h2>
      <p>
        Under the Australian Privacy Principles you have the right to:
      </p>
      <ul>
        <li>
          <strong>Access</strong> the personal information we hold about you
          and how it is handled (APP 12), including a copy on request;
        </li>
        <li>
          <strong>Correction</strong> of personal information that is
          inaccurate, out of date, incomplete, irrelevant, or misleading
          (APP 13);
        </li>
        <li>
          <strong>Anonymity</strong> where it is lawful and practicable — note
          that an account and payment method are required to use the service,
          so full anonymity is not practicable here;
        </li>
        <li>
          <strong>Deletion</strong> of your account and associated data, as
          described above;
        </li>
        <li>
          <strong>Complain</strong> about a suspected breach of the APPs or a
          registered APP code.
        </li>
      </ul>
      <p>
        To exercise any of these rights, contact us using the details below.
        We will acknowledge your request and respond within a reasonable
        timeframe (and in any case within 30 days for access and correction
        requests). If you are not satisfied with our response, you may lodge a
        complaint with the Office of the Australian Information Commissioner
        (OAIC) at{" "}
        <a href="https://www.oaic.gov.au" rel="noopener noreferrer">
          oaic.gov.au
        </a>{" "}
        or on 1300 363 992.
      </p>

      <h2>Data breaches</h2>
      <p>
        If a data breach is likely to result in serious harm to you, we will
        comply with the Notifiable Data Breaches scheme under Part IIIC of the
        Privacy Act, including assessing the breach and notifying affected
        individuals and the OAIC as required.
      </p>

      <h2>Policy changes</h2>
      <p>
        If we change this policy, we will post the updated version on this page
        with a new &quot;Last updated&quot; date. Where a change materially
        affects how we use personal information already collected, we will seek
        fresh consent before applying it to you.
      </p>

      <h2>Contact</h2>
      <p>
        Questions, access or correction requests, or deletion requests:{" "}
        <a href="mailto:peskycipher@gmail.com">peskycipher@gmail.com</a>
      </p>

      <p style={{ marginTop: 48 }}>
        <Link href="/" className="muted">
          ← Back to home
        </Link>
      </p>
    </main>
  );
}