import nodemailer from 'nodemailer';

/**
 * Configure Nodemailer Transporter
 */
const createTransporter = () => {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port: Number(port),
      secure: port === '465',
      auth: { user, pass },
    });
  }

  // Fallback for local development if real SMTP credentials aren't set
  return null;
};

/**
 * Send OTP Verification Email
 */
export const sendOTPEmail = async (email, otpCode) => {
  const transporter = createTransporter();
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

  if (transporter) {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"Swastha Support" <noreply@swastha.app>',
      to: email,
      subject,
      html,
    });
    console.log(`[Mailer] OTP email sent successfully to ${email}`);
  } else {
    console.log(`\n==========================================`);
    console.log(`📧 [DEV EMAIL SIMULATOR]`);
    console.log(`To: ${email}`);
    console.log(`Subject: ${subject}`);
    console.log(`OTP Code: ${otpCode}`);
    console.log(`==========================================\n`);
  }
};

/**
 * Send Password Reset Link Email
 */
export const sendPasswordResetEmail = async (email, resetToken) => {
  const transporter = createTransporter();
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

  if (transporter) {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"Swastha Support" <noreply@swastha.app>',
      to: email,
      subject,
      html,
    });
    console.log(`[Mailer] Password reset email sent to ${email}`);
  } else {
    console.log(`\n==========================================`);
    console.log(`📧 [DEV EMAIL SIMULATOR]`);
    console.log(`To: ${email}`);
    console.log(`Subject: ${subject}`);
    console.log(`Reset URL: ${resetUrl}`);
    console.log(`==========================================\n`);
  }
};
