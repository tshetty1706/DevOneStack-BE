import "dotenv/config";
import { Resend } from "resend";

// Helper to get Resend instance
const getResendClient = () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
};

// Determine the sender address (Resend testing domain onboarding@resend.dev is used as fallback)
const getFromEmail = () => {
  return process.env.EMAIL_FROM || "DevOneStack <onboarding@resend.dev>";
};

export const sendVerificationEmail = async (email, token) => {
  const clientUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || "http://localhost:5173";
  const url = `${clientUrl}/verify-email/${token}`;
  
  console.log(`\n==================================================`);
  console.log(`📧 [EMAIL VERIFICATION] Link for ${email}:`);
  console.log(`🔗 ${url}`);
  console.log(`==================================================\n`);

  const resend = getResendClient();
  if (!resend) {
    console.warn("⚠️ Resend API Key (RESEND_API_KEY) not configured. Verification link printed above.");
    return { success: false, reason: "no_api_key" };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: getFromEmail(),
      to: email,
      subject: "Verify your DevOneStack account",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0c0d14; color: #f8fafc; margin: 0; padding: 40px 20px; }
            .container { max-width: 520px; margin: 0 auto; background-color: #12131f; border: 1px solid #1e2038; border-radius: 12px; padding: 36px; text-align: center; }
            .logo { font-size: 24px; font-weight: 800; color: #6366f1; letter-spacing: -0.5px; margin-bottom: 24px; }
            h2 { color: #ffffff; font-size: 20px; font-weight: 700; margin-bottom: 12px; }
            p { font-size: 14px; line-height: 1.6; color: #94a3b8; margin-bottom: 28px; }
            .btn { background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%); color: #ffffff !important; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block; box-shadow: 0 4px 14px rgba(99,102,241,0.4); }
            .footer { font-size: 12px; color: #64748b; margin-top: 32px; border-top: 1px solid #1e2038; padding-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="logo">⚡ DevOneStack</div>
            <h2>Verify your email address</h2>
            <p>Thank you for signing up! Click the button below to verify your email and activate your account.</p>
            <div style="margin: 28px 0;">
              <a href="${url}" class="btn" target="_blank">Verify Email</a>
            </div>
            <div class="footer">
              This link will expire in 24 hours.<br>
              If you didn't create a DevOneStack account, you can safely ignore this email.
            </div>
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error(`❌ [Resend Error] Failed to send verification email to ${email}:`, error.message);
      if (error.statusCode === 403) {
        console.warn(`ℹ️ [Resend Free Tier Note]: The default domain 'onboarding@resend.dev' can only deliver to your verified Resend account email. To send to any recipient, verify a domain in your Resend Dashboard (resend.com/domains). In the meantime, use the verification link printed above in the terminal.`);
      }
      return { success: false, error };
    }

    console.log(`✅ Verification email dispatched successfully to ${email} (ID: ${data?.id})`);
    return { success: true, id: data?.id };
  } catch (err) {
    console.error("❌ Exception during verification email dispatch:", err.message);
    return { success: false, error: err };
  }
};

export const sendResetPasswordEmail = async (email, token) => {
  const clientUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || "http://localhost:5173";
  const url = `${clientUrl}/reset-password/${token}`;

  console.log(`\n==================================================`);
  console.log(`🔑 [PASSWORD RESET] Link for ${email}:`);
  console.log(`🔗 ${url}`);
  console.log(`==================================================\n`);

  const resend = getResendClient();
  if (!resend) {
    console.warn("⚠️ Resend API Key (RESEND_API_KEY) not configured. Reset link printed above.");
    return { success: false, reason: "no_api_key" };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: getFromEmail(),
      to: email,
      subject: "Reset your DevOneStack password",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0c0d14; color: #f8fafc; margin: 0; padding: 40px 20px; }
            .container { max-width: 520px; margin: 0 auto; background-color: #12131f; border: 1px solid #1e2038; border-radius: 12px; padding: 36px; text-align: center; }
            .logo { font-size: 24px; font-weight: 800; color: #6366f1; letter-spacing: -0.5px; margin-bottom: 24px; }
            h2 { color: #ffffff; font-size: 20px; font-weight: 700; margin-bottom: 12px; }
            p { font-size: 14px; line-height: 1.6; color: #94a3b8; margin-bottom: 28px; }
            .btn { background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%); color: #ffffff !important; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block; box-shadow: 0 4px 14px rgba(99,102,241,0.4); }
            .footer { font-size: 12px; color: #64748b; margin-top: 32px; border-top: 1px solid #1e2038; padding-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="logo">⚡ DevOneStack</div>
            <h2>Password Reset Request</h2>
            <p>You requested a password reset for your DevOneStack account. Click the button below to choose a new password.</p>
            <a href="${url}" class="btn" target="_blank">Reset Password</a>
            <div class="footer">
              This link will expire in 1 hour.<br>
              If you didn't request a password reset, you can safely ignore this email.
            </div>
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error(`❌ [Resend Error] Failed to send password reset email to ${email}:`, error.message);
      if (error.statusCode === 403) {
        console.warn(`ℹ️ [Resend Free Tier Note]: The default domain 'onboarding@resend.dev' can only deliver to your verified Resend account email. To send to any recipient, verify a domain in your Resend Dashboard (resend.com/domains). In the meantime, use the reset link printed above in the terminal.`);
      }
      return { success: false, error };
    }

    console.log(`✅ Password reset email dispatched successfully to ${email} (ID: ${data?.id})`);
    return { success: true, id: data?.id };
  } catch (err) {
    console.error("❌ Exception during password reset email dispatch:", err.message);
    return { success: false, error: err };
  }
};

export const sendResetConfirmationEmail = async (email) => {
  console.log(`📧 [PASSWORD RESET CONFIRMATION] Sending to ${email}`);

  const resend = getResendClient();
  if (!resend) return { success: false, reason: "no_api_key" };

  try {
    const { data, error } = await resend.emails.send({
      from: getFromEmail(),
      to: email,
      subject: "Your DevOneStack password was changed",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0c0d14; color: #f8fafc; margin: 0; padding: 40px 20px; }
            .container { max-width: 520px; margin: 0 auto; background-color: #12131f; border: 1px solid #1e2038; border-radius: 12px; padding: 36px; text-align: center; }
            .logo { font-size: 24px; font-weight: 800; color: #6366f1; letter-spacing: -0.5px; margin-bottom: 24px; }
            h2 { color: #ffffff; font-size: 20px; font-weight: 700; margin-bottom: 12px; }
            p { font-size: 14px; line-height: 1.6; color: #94a3b8; margin-bottom: 24px; }
            .footer { font-size: 12px; color: #ef4444; margin-top: 24px; border-top: 1px solid #1e2038; padding-top: 16px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="logo">⚡ DevOneStack</div>
            <h2>Password Changed Successfully</h2>
            <p>Your DevOneStack account password has been updated. You can now use your new password to log in.</p>
            <div class="footer">
              If you did not perform this change, please reset your password immediately or contact support.
            </div>
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error(`❌ [Resend Error] Failed to send password change confirmation to ${email}:`, error.message);
      return { success: false, error };
    }

    console.log(`✅ Password reset confirmation email sent to ${email} (ID: ${data?.id})`);
    return { success: true, id: data?.id };
  } catch (err) {
    console.error("❌ Exception during confirmation email dispatch:", err.message);
    return { success: false, error: err };
  }
};
