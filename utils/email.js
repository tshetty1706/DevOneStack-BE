import nodemailer from "nodemailer";

const getTransporter = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return null;
  }
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port: parseInt(process.env.EMAIL_PORT || "587"),
    secure: process.env.EMAIL_PORT === "465",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

export const sendVerificationEmail = async (email, token) => {
  const clientUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || "http://localhost:5173";
  const url = `${clientUrl}/verify-email/${token}`;
  console.log(`[EMAIL VERIFICATION] Link for ${email}: ${url}`);

  const transporter = getTransporter();
  if (!transporter) {
    console.log("Nodemailer not configured. Link printed above.");
    return;
  }

  const mailOptions = {
    from: process.env.EMAIL_FROM || "DevOneStack <noreply@devonestack.com>",
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
  };

  await transporter.sendMail(mailOptions);
};

export const sendResetPasswordEmail = async (email, token) => {
  const clientUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || "http://localhost:5173";
  const url = `${clientUrl}/reset-password/${token}`;
  console.log(`[PASSWORD RESET] Link for ${email}: ${url}`);

  const transporter = getTransporter();
  if (!transporter) {
    console.log("Nodemailer not configured. Link printed above.");
    return;
  }

  const mailOptions = {
    from: process.env.EMAIL_FROM || "DevOneStack <noreply@devonestack.com>",
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
  };

  await transporter.sendMail(mailOptions);
};

export const sendResetConfirmationEmail = async (email) => {
  console.log(`[PASSWORD RESET CONFIRMATION] Sent to ${email}`);

  const transporter = getTransporter();
  if (!transporter) return;

  const mailOptions = {
    from: process.env.EMAIL_FROM || "DevOneStack <noreply@devonestack.com>",
    to: email,
    subject: "Your DevOneStack password was changed",
    html: `
      <div style="background-color: #0a0a0a; color: #ffffff; padding: 40px; font-family: sans-serif; text-align: center; border-radius: 8px;">
        <h1 style="color: #6366f1; margin-bottom: 20px;">DevOneStack</h1>
        <p style="font-size: 16px; color: #a3a3a3; margin-bottom: 20px;">Your password has been successfully changed.</p>
        <p style="font-size: 13px; color: #ef4444;">If this wasn't you, please contact support immediately.</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};
