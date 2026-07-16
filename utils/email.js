import { Resend } from "resend";

// Initialize Resend client with API Key
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Determine the sender address (Resend testing domain onboarding@resend.dev is used as fallback)
const getFromEmail = () => {
  return process.env.EMAIL_FROM || "onboarding@resend.dev";
};

export const sendVerificationEmail = async (email, token) => {
  const clientUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || "http://localhost:5173";
  const url = `${clientUrl}/verify-email/${token}`;
  console.log(`[EMAIL VERIFICATION] Link for ${email}: ${url}`);

  if (!resend) {
    console.log("Resend API Key not configured. Link printed above.");
    return;
  }

  try {
    await resend.emails.send({
      from: getFromEmail(),
      to: email,
      subject: "Verify your DevOneStack account",
      html: `
        <div style="background-color: #0a0a0a; color: #ffffff; padding: 40px; font-family: sans-serif; text-align: center; border-radius: 8px;">
          <h1 style="color: #6366f1; margin-bottom: 20px;">DevOneStack</h1>
          <p style="font-size: 16px; color: #a3a3a3; margin-bottom: 30px;">Thank you for signing up! Please verify your email to activate your account.</p>
          <a href="${url}" style="background-color: #6366f1; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Verify Email</a>
          <p style="font-size: 12px; color: #666666; margin-top: 30px;">This link will expire in 24 hours.</p>
        </div>
      `,
    });
    console.log(`Verification email sent to ${email} via Resend`);
  } catch (err) {
    console.error("Resend error sending verification email:", err.message);
  }
};

export const sendResetPasswordEmail = async (email, token) => {
  const clientUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || "http://localhost:5173";
  const url = `${clientUrl}/reset-password/${token}`;
  console.log(`[PASSWORD RESET] Link for ${email}: ${url}`);

  if (!resend) {
    console.log("Resend API Key not configured. Link printed above.");
    return;
  }

  try {
    await resend.emails.send({
      from: getFromEmail(),
      to: email,
      subject: "Reset your DevOneStack password",
      html: `
        <div style="background-color: #0a0a0a; color: #ffffff; padding: 40px; font-family: sans-serif; text-align: center; border-radius: 8px;">
          <h1 style="color: #6366f1; margin-bottom: 20px;">DevOneStack</h1>
          <p style="font-size: 16px; color: #a3a3a3; margin-bottom: 20px;">You requested a password reset. Click the button below to choose a new password.</p>
          <a href="${url}" style="background-color: #6366f1; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
          <p style="font-size: 12px; color: #ef4444; margin-top: 30px;">If you did not request this, please ignore this email. Your password will remain unchanged.</p>
          <p style="font-size: 11px; color: #666666;">This link will expire in 1 hour.</p>
        </div>
      `,
    });
    console.log(`Password reset email sent to ${email} via Resend`);
  } catch (err) {
    console.error("Resend error sending reset email:", err.message);
  }
};

export const sendResetConfirmationEmail = async (email) => {
  console.log(`[PASSWORD RESET CONFIRMATION] Sent to ${email}`);

  if (!resend) return;

  try {
    await resend.emails.send({
      from: getFromEmail(),
      to: email,
      subject: "Your DevOneStack password was changed",
      html: `
        <div style="background-color: #0a0a0a; color: #ffffff; padding: 40px; font-family: sans-serif; text-align: center; border-radius: 8px;">
          <h1 style="color: #6366f1; margin-bottom: 20px;">DevOneStack</h1>
          <p style="font-size: 16px; color: #a3a3a3; margin-bottom: 20px;">Your password has been successfully changed.</p>
          <p style="font-size: 13px; color: #ef4444;">If this wasn't you, please contact support immediately.</p>
        </div>
      `,
    });
    console.log(`Password reset confirmation sent to ${email} via Resend`);
  } catch (err) {
    console.error("Resend error sending confirmation email:", err.message);
  }
};
