
import { escapeHtml } from './emailActionPage.js';
import { fetchWithTimeout, TIMEOUTS } from './fetchWithTimeout.js';

/**
 * Swastha Mailer Utility — Powered by Brevo HTTPS REST API (Port 443)
 */

async function sendEmailViaBrevo(to, subject, html) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    const error = 'BREVO_API_KEY is not configured in the backend environment.';
    console.error('[Brevo Mailer Error]', error);
    throw new Error(error);
  }

  const senderEmail = process.env.EMAIL_FROM_ADDRESS || 'swasthaprojectt@gmail.com';

  try {
    const res = await fetchWithTimeout('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Swastha Support', email: senderEmail },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    }, TIMEOUTS.email);

    if (res.ok) {
      console.log('[Brevo HTTPS Mailer] Email delivered successfully.');
      return true;
    }

    // The response body can echo the recipient's address and message details,
    // so only the status is kept.
    const message = `Brevo returned ${res.status}`;
    console.error('[Brevo Mailer Error]', message);
    throw new Error(message);
  } catch (err) {
    const message = err?.message || 'Unknown email sending error.';
    console.error('[Brevo Mailer Exception]', message);
    throw new Error(message);
  }
}

export const sendOTPEmail = async (email, otpCode) => {
  const subject = 'Swastha — Verification Code';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 12px; background-color: #ffffff;">
      <h2 style="color: #004ac6; margin-bottom: 10px;">Swastha Health Verification</h2>
      <p style="font-size: 14px; color: #434655;">Use the following 6-digit security code to complete your verification:</p>
      <div style="background-color: #f3f3fe; text-align: center; padding: 18px; border-radius: 8px; margin: 20px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #2563eb;">${otpCode}</span>
      </div>
      <p style="font-size: 12px; color: #737686;">This code is valid for 10 minutes. If you did not request this, please ignore this email.</p>
    </div>
  `;

  await sendEmailViaBrevo(email, subject, html);
  console.log('📧 [SWASTHA MAILER] Verification code generated and sent.');
};

export const sendPasswordResetEmail = async (email, resetToken) => {
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`;
  const subject = 'Swastha — Reset Your Password';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 12px; background-color: #ffffff;">
      <h2 style="color: #004ac6; margin-bottom: 10px;">Reset Your Swastha Password</h2>
      <p style="font-size: 14px; color: #434655;">Click the button below to reset your account password:</p>
      <div style="text-align: center; margin: 25px 0;">
        <a href="${resetUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
          Reset Password
        </a>
      </div>
      <p style="font-size: 12px; color: #737686;">Link: ${resetUrl}</p>
      <p style="font-size: 12px; color: #737686;">If you didn't request a password reset, you can safely ignore this email.</p>
    </div>
  `;

  await sendEmailViaBrevo(email, subject, html);
};

// Sent instead of a verification code when someone tries to register an address
// that already has an account. The registration form answers the same way
// either way (so it can't be used to find out who is registered); this email is
// how the real owner finds out and what to do.
export const sendAccountExistsEmail = async (email) => {
  const frontend = process.env.FRONTEND_URL || 'http://localhost:5173';
  const subject = 'Swastha — You already have an account';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 12px; background-color: #ffffff;">
      <h2 style="color: #004ac6; margin-bottom: 10px;">You already have a Swastha account</h2>
      <p style="font-size: 14px; color: #434655;">Someone, hopefully you, tried to create a Swastha account with this email address, but one already exists.</p>
      <div style="text-align: center; margin: 25px 0;">
        <a href="${frontend}/login" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Log in</a>
      </div>
      <p style="font-size: 14px; color: #434655;">Forgot your password? You can <a href="${frontend}/forgot-password" style="color: #2563eb;">reset it here</a>.</p>
      <p style="font-size: 12px; color: #737686;">If this wasn't you, you can ignore this email. Nothing about your account has changed.</p>
    </div>
  `;

  await sendEmailViaBrevo(email, subject, html);
};

export const sendFamilyMemberAuthorizationEmail = async (email, inviterEmail, memberName, authorizationToken) => {
  const authorizeUrl = `${process.env.BACKEND_URL || 'http://localhost:5001'}/api/family/members/authorize/confirm?token=${authorizationToken}`;
  const subject = 'Swastha — Please Authorize Family Vault Access';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 12px; background-color: #ffffff;">
      <h2 style="color: #004ac6; margin-bottom: 10px;">Authorize access to the Family Vault</h2>
      <p style="font-size: 14px; color: #434655;">${memberName ? `${escapeHtml(memberName)} has been added to a Family Vault and is requesting your authorization.` : 'A new family member has been added to a Family Vault and is requesting your permission.'}</p>
      <p style="font-size: 14px; color: #434655;">${inviterEmail ? `This request was sent by ${escapeHtml(inviterEmail)}. Please review and grant the required access permission.` : 'Please review and grant the required access permission for the shared health workspace.'}</p>
      <div style="text-align: center; margin: 25px 0;">
        <a href="${authorizeUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
          Authorize Access
        </a>
      </div>
      <p style="font-size: 14px; color: #434655;">Once you authorize, the family member will be granted permission to become an admin of the family vault.</p>
      <p style="font-size: 12px; color: #737686;">If you did not expect this permission request, you can safely ignore this email.</p>
    </div>
  `;

  return await sendEmailViaBrevo(email, subject, html);
};

export const sendDoctorRequestEmail = async (email, doctorName, acceptUrl, declineUrl) => {
  const subject = 'Swastha — A doctor requested access to your health records';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 12px; background-color: #ffffff;">
      <h2 style="color: #004ac6; margin-bottom: 10px;">Doctor access request</h2>
      <p style="font-size: 14px; color: #434655;">${doctorName ? `Dr. ${escapeHtml(String(doctorName).replace(/^dr\.?\s+/i, ''))}` : 'A doctor'} has requested access to your health records on Swastha.</p>
      <p style="font-size: 14px; color: #434655;">You can respond right from this email, or from the notification bell in the app — whichever you use first, the other will show the same result.</p>
      <p style="font-size: 14px; color: #434655;">If you accept, access is granted for 24 hours — after that, the doctor will need to request access again.</p>
      <div style="text-align: center; margin: 25px 0;">
        <a href="${acceptUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; margin: 0 8px;">
          Accept
        </a>
        <a href="${declineUrl}" style="background-color: #ffffff; color: #475569; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; margin: 0 8px; border: 1px solid #cbd5e1;">
          Decline
        </a>
      </div>
      <p style="font-size: 12px; color: #737686;">If you did not expect this request, you can safely decline it or ignore this email.</p>
    </div>
  `;

  return await sendEmailViaBrevo(email, subject, html);
};

