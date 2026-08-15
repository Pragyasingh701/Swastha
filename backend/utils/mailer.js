import dotenv from 'dotenv';

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
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
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
    });

    if (res.ok) {
      console.log(`[Brevo HTTPS Mailer] Email delivered successfully to ${to}`);
      return true;
    }

    const errText = await res.text();
    const message = `Brevo returned ${res.status}: ${errText}`;
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
  console.log(`📧 [SWASTHA MAILER] Verification code generated for ${email}`);
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

export const sendFamilyMemberAuthorizationEmail = async (email, inviterEmail, memberName, authorizationToken) => {
  const authorizeUrl = `${process.env.BACKEND_URL || 'http://localhost:5001'}/api/family/members/authorize/confirm?token=${authorizationToken}`;
  const subject = 'Swastha — Please Authorize Family Vault Access';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 12px; background-color: #ffffff;">
      <h2 style="color: #004ac6; margin-bottom: 10px;">Authorize access to the Family Vault</h2>
      <p style="font-size: 14px; color: #434655;">${memberName ? `${memberName} has been added to a Family Vault and is requesting your authorization.` : 'A new family member has been added to a Family Vault and is requesting your permission.'}</p>
      <p style="font-size: 14px; color: #434655;">${inviterEmail ? `This request was sent by ${inviterEmail}. Please review and grant the required access permission.` : 'Please review and grant the required access permission for the shared health workspace.'}</p>
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

