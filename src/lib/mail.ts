import nodemailer from "nodemailer";
import { saveLocalMail } from "@/server/security/local-mail";
import { assertExternalWrites } from "@/server/security/external-writes";

type MailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
};

export function getMailConfig(): MailConfig {
  const port = Number(process.env.SMTP_PORT || process.env.EMAIL_PORT || 587);
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;

  return {
    host: process.env.SMTP_HOST || process.env.EMAIL_HOST || "smtp.gmail.com",
    port,
    secure: port === 465,
    user,
    pass: process.env.SMTP_PASS || process.env.EMAIL_PASS,
    from: process.env.SMTP_FROM || process.env.EMAIL_FROM || user || "Wolf Gym",
  };
}

export function getAppBaseUrl() {
  return (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}

function getTransporter() {
  const config = getMailConfig();

  if (!config.user || !config.pass) {
    throw new Error("Faltan credenciales SMTP/EMAIL para enviar correos.");
  }

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    dnsTimeout: 10000,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
}

export async function sendEmail(to: string, subject: string, html: string) {
  if (await saveLocalMail({ to, subject, html })) return;
  assertExternalWrites();
  const config = getMailConfig();
  const transporter = getTransporter();

  await transporter.sendMail({
    from: config.from.includes("<") ? config.from : `"Wolf Gym" <${config.from}>`,
    to,
    subject,
    html,
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function sendPasswordResetEmail(to: string, name: string, resetLink: string) {
  const safeName = escapeHtml(name?.trim() || "Wolf");
  const safeResetLink = escapeHtml(resetLink);

  await sendEmail(
    to,
    "Recuperacion de contrasena - Wolf Gym",
    `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #1f2937; max-width: 620px; margin: 0 auto;">
        <h2 style="color: #d97706;">Recuperacion de contrasena - Wolf Gym</h2>
        <p>Hola <strong>${safeName}</strong>,</p>
        <p>Recibimos una solicitud para restablecer tu contrasena.</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${safeResetLink}" style="background-color: #facc15; color: #111827; padding: 12px 20px; text-decoration: none; border-radius: 8px; font-weight: 700;">
            Restablecer contrasena
          </a>
        </p>
        <p>Este enlace expira en 1 hora. Si no solicitaste este cambio, ignora este correo.</p>
        <p style="color: #6b7280; font-size: 13px;">Si el boton no abre, copia este enlace en tu navegador:<br><a href="${safeResetLink}">${safeResetLink}</a></p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 28px 0;">
        <p style="text-align: center; color: #9ca3af; font-size: 12px;">Wolf Gym - Libera tu lobo interior</p>
      </div>
    `
  );
}
