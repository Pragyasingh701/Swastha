import React from "react";
import { Link, useLocation } from "react-router-dom";
import SiteFooter from "../../../components/Common/SiteFooter";

export const legalContent = {
  privacy: {
    title: "Privacy Policy",
    intro:
      "This Privacy Policy explains what information Swastha collects, why we use it, how we protect it, and the choices available to you when you use our website and services.",
    effectiveDate: "September 13, 2026",
    sections: [
      ["Information we collect", "We may collect your name, email address, phone number, account credentials, patient code, profile details, health records, medical timelines, family-vault information, doctor and family relationships, uploaded files, notification preferences, and messages you send to support. We may also collect device, browser, IP address, access-log, and cookie information needed for security, reliability, and service operation."],
      ["Health information", "Health information may include medical history, reports, prescriptions, diagnoses, symptoms, documents, and other information you or an authorized person adds to Swastha. Please only add another person’s information when you have the required permission or legal authority to do so."],
      ["How we use information", "We use information to create and secure accounts, verify patient codes, store and organize health records, operate the Family Vault and Health Timeline, connect authorized doctors and family members, send notifications, respond to support requests, provide AI-assisted organization features that you request, prevent misuse, troubleshoot problems, and improve the reliability and security of the service."],
      ["Sharing and service providers", "We do not sell your personal information. We may share information with infrastructure, hosting, authentication, storage, analytics, security, communications, and AI service providers that process it on our behalf. We may also disclose information when required by law, to protect rights and safety, investigate abuse, enforce our terms, or complete a merger, acquisition, financing, or sale of assets."],
      ["Authorized access", "Doctors, family administrators, and other users can access health information only through the permissions and relationships supported by Swastha. Access may include information needed to provide the feature you authorize. Review linked users and permissions regularly and remove access when it is no longer appropriate."],
      ["Cookies and similar technologies", "Swastha may use essential cookies or similar technologies to keep you signed in, protect accounts, remember preferences, measure reliability, and understand how features are used. Where required, we will request consent for non-essential technologies. You can control cookies through your browser, but disabling essential cookies may affect functionality."],
      ["Data retention and deletion", "We retain information for as long as needed to provide the service, meet legal and security obligations, resolve disputes, enforce agreements, and maintain reliable records. When information is deleted, copies may remain temporarily in backups or security logs before being securely removed according to our retention procedures."],
      ["Security", "We use authentication, authorization checks, access controls, logging, and security practices designed to protect information from unauthorized access, loss, misuse, or alteration. Passwords are stored as one-way bcrypt hashes using a cost factor of 12; Swastha does not store or return passwords in plain text. No online service can guarantee absolute security. Use a strong password, keep credentials private, and notify us promptly about suspected unauthorized access."],
      ["Encryption in transit and on the application wire", "For supported sensitive fields exchanged between the application and backend, Swastha uses a Web Crypto-compatible session handshake based on ephemeral ECDH with the P-256 curve. Both sides derive a non-extractable AES-256-GCM session key through HKDF-SHA-256, and each encrypted value uses a fresh random initialization vector with authenticated encryption. Sensitive fields such as identity and contact details, credentials in requests, and configured whole-value fields may be encrypted before transmission; password hashes are removed from API responses entirely. This application-layer protection complements, and does not replace, HTTPS/TLS, access controls, secure key handling, database protections, and other infrastructure safeguards."],
      ["Encryption scope and limitations", "Application-layer wire encryption applies only to configured fields and supported API flows. It is not a guarantee that every field, integration, browser extension, log, backup, or third-party service is encrypted by this mechanism. Some information must be decrypted in authorized application memory to provide the requested feature. We continue to test and improve coverage, key handling, monitoring, and encryption at rest where appropriate."],
      ["Your privacy rights", "Subject to applicable law, you may request access to, correction of, deletion of, or a copy of your information. You may also request restriction or object to certain processing, withdraw consent, and complain to your local data-protection authority. We may verify your identity before completing a request and may retain information where the law allows or requires it."],
      ["Healthcare disclaimer", "Swastha is an information-management service, not a hospital, emergency service, doctor, diagnostic tool, or substitute for professional medical advice. Do not use it for emergencies or make diagnosis or treatment decisions solely from information shown in the service. Contact a qualified healthcare professional or local emergency services when needed."],
      ["AI-assisted features", "Some features may use AI to organize or summarize information you submit. AI output can be incomplete or inaccurate and must be reviewed by you and, where appropriate, a qualified healthcare professional. Do not treat AI output as medical advice."],
      ["Data incidents", "If we determine that a security incident affects your information, we will provide notices required by applicable law and take reasonable steps to investigate, contain, and reduce the impact of the incident."],
      ["Policy changes", "We may update this Privacy Policy when our practices, services, or legal obligations change. We will update the effective date and provide additional notice when required. Continued use after an update means the updated policy applies to future use."],
    ],
  },
  terms: {
    title: "Terms & Conditions",
    intro:
      "These Terms & Conditions govern your access to and use of Swastha. By creating an account, accessing, or using the service, you agree to these terms and our Privacy Policy.",
    effectiveDate: "September 13, 2026",
    sections: [
      ["Agreement and eligibility", "You must be legally able to enter into these terms under the laws that apply to you. If you use Swastha for an organization, family member, patient, or practice, you confirm that you have authority to accept these terms on their behalf. Swastha is not intended for children below the minimum age required in their location without appropriate legally authorized supervision."],
      ["Service purpose", "Swastha helps users organize, store, and share health information through features such as profiles, the Health Timeline, Family Vault, doctor-patient connections, notifications, file uploads, and AI-assisted organization. Features may change, be limited, or be discontinued as the service develops."],
      ["Not medical advice or emergency care", "Swastha is not a doctor, hospital, pharmacy, emergency service, diagnostic service, or substitute for professional medical advice. Information, reminders, summaries, and AI-generated output may be incomplete or inaccurate. Do not use Swastha for emergencies or make diagnosis, treatment, or medication decisions solely from the service. Contact a qualified healthcare professional or local emergency services when needed."],
      ["Account registration and security", "You must provide accurate, current information and keep it updated. You are responsible for protecting your password, authentication factors, patient code, and devices, and for all activity under your account. Do not share credentials or allow unauthorized access. Notify us promptly if you suspect compromise."],
      ["Patient codes and identity", "Patient codes are used to identify and connect records within supported workflows. You must not guess, collect, sell, share, or use another person’s patient code without authorization. You are responsible for confirming that information belongs to the intended person before adding, viewing, or sharing it."],
      ["Health data and authorization", "You retain responsibility for the health information and files you submit. You confirm that you have the rights, consent, or legal authority required to upload, manage, or share another person’s information. Only connect doctors, family administrators, or other users when the relationship and authorization are genuine and current."],
      ["Doctor and family access", "Access granted through a doctor-patient link, family membership, administrator role, or other permission must be used only for the authorized purpose. You must respect confidentiality, remove access when it is no longer appropriate, and not copy, export, disclose, or use another person’s health information beyond the authorization provided."],
      ["User content and accuracy", "You are responsible for the legality, accuracy, completeness, and timeliness of content you submit, including reports, dates, prescriptions, documents, images, comments, and profile information. Swastha does not independently verify user-submitted information and is not responsible for decisions based on inaccurate or incomplete content."],
      ["AI-assisted features", "AI features may organize, summarize, classify, or otherwise process information you provide. Their output is for informational assistance only, may contain errors, and must be reviewed before use. You remain responsible for verifying output and must not represent AI output as professional medical advice."],
      ["Acceptable use", "You must not use Swastha to violate laws or another person’s rights; access accounts or records without authorization; impersonate another person; submit malicious code or unlawful, abusive, defamatory, or infringing content; harvest data; bypass security; reverse engineer the service; interfere with availability; or use the service to build a competing product without permission."],
      ["Privacy", "Our Privacy Policy explains how we collect, use, disclose, retain, and protect personal information. By using Swastha, you acknowledge that information may be processed as described in that policy. These terms do not reduce rights that cannot legally be waived."],
      ["User content license", "You grant Swastha the limited rights needed to host, store, transmit, display, back up, and process your content to operate, secure, maintain, and improve the features you request. This license ends when the content is deleted, except for residual backups, legal records, or information that must be retained under applicable law."],
      ["Intellectual property", "Swastha, including its software, design, branding, text, interfaces, and documentation, is owned by Swastha or its licensors and is protected by applicable intellectual-property laws. These terms grant you a limited, personal, non-exclusive, non-transferable right to use the service; they do not transfer ownership."],
      ["Third-party services", "Swastha may rely on third-party infrastructure, authentication, storage, communications, AI, analytics, payment, or other services. Third-party services may have separate terms and privacy policies. We are not responsible for third-party services outside our reasonable control."],
      ["Availability and changes", "We aim to provide a reliable service but do not guarantee uninterrupted, error-free, or permanently available access. Maintenance, security events, provider failures, legal requirements, or product changes may affect availability. We may add, modify, restrict, or remove features and will provide notice where required."],
      ["Fees and subscriptions", "If Swastha introduces paid features, pricing, billing terms, renewal rules, taxes, cancellation, and refund conditions will be presented before purchase and may be governed by additional terms. You authorize the applicable payment method for charges you approve."],
      ["Suspension and termination", "We may suspend, restrict, or terminate access if you breach these terms, create security or legal risk, misuse another person’s information, fail to pay applicable fees, or if required by law. You may stop using the service or request account deletion. Provisions concerning ownership, privacy, disclaimers, limitations, indemnity, and disputes survive termination."],
      ["Disclaimers", "To the maximum extent permitted by law, Swastha is provided on an 'as available' and 'as is' basis. We disclaim warranties that the service will be uninterrupted, secure, accurate, complete, fit for a particular purpose, or free of harmful components. Nothing in these terms excludes a warranty or right that cannot legally be excluded."],
      ["Limitation of liability", "To the maximum extent permitted by law, Swastha and its operators, employees, licensors, and service providers will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for loss of data, profits, goodwill, or access arising from use of or inability to use the service. Any direct-liability cap will be the amount permitted by applicable law and, where allowed, the amount you paid for the service during the applicable period."],
      ["Indemnification", "To the extent permitted by law, you agree to defend, indemnify, and hold harmless Swastha and its operators, employees, licensors, and service providers from claims, losses, liabilities, damages, costs, and expenses arising from your breach of these terms, misuse of the service, unlawful content, or violation of another person’s rights."],
      ["Feedback", "If you provide suggestions, ideas, or feedback, you allow Swastha to use them without restriction or compensation, provided that doing so does not identify you or disclose your confidential information contrary to our Privacy Policy."],
      ["Disputes and applicable law", "These terms are governed by the applicable laws and dispute-resolution rules for the jurisdiction associated with Swastha’s operating entity, unless mandatory consumer or healthcare laws require otherwise. Before starting formal proceedings, contact us so we can attempt to resolve the concern. The final jurisdiction, entity name, and address should be completed by Swastha’s legal counsel before publication."],
      ["Changes to these terms", "We may update these terms when the service, law, or business practices change. We will update the effective date and provide additional notice for material changes when required. Your continued use after the effective date means you accept the revised terms. If you do not agree, stop using the service and request account closure."],
      ["Basic questions", "For answers to common questions about Swastha, visit the FAQ section on the home page. Do not use Swastha or the FAQ for urgent medical information or emergency requests."],
    ],
  },
};

export default function LegalPage() {
  const { pathname } = useLocation();
  const page = pathname.includes("terms") ? legalContent.terms : legalContent.privacy;

  return (
    <div className="min-h-screen bg-background text-on-surface">
      <header className="border-b border-outline-variant/30 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <Link className="text-xl font-bold tracking-tight text-primary" to="/">
            Swastha
          </Link>
          <Link className="text-sm font-semibold text-primary hover:underline" to="/">
            Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">
          Swastha
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-on-surface">
          {page.title}
        </h1>
        <p className="mt-5 text-lg leading-8 text-on-surface-variant">
          {page.intro}
        </p>
        {page.effectiveDate && (
          <p className="mt-4 text-sm text-on-surface-variant">
            Effective date: {page.effectiveDate}
          </p>
        )}

        <div className="mt-12 space-y-8">
          {page.sections.map(([heading, text]) => (
            <section key={heading}>
              <h2 className="text-xl font-semibold text-on-surface">{heading}</h2>
              <p className="mt-2 leading-7 text-on-surface-variant">{text}</p>
            </section>
          ))}
        </div>

        <p className="mt-12 border-t border-outline-variant/30 pt-6 text-sm text-on-surface-variant">
          Have a basic question?{" "}
          <a className="font-semibold text-primary hover:underline" href="/#faq">
            Visit the FAQ
          </a>
          .
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
