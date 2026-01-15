import * as nodemailer from 'nodemailer';
import { Injectable, Logger } from '@nestjs/common';

const OTP_EXPIRES_IN_MINUTES = Number(process.env.OTP_EXPIRES_IN_MINUTES ?? 10);
const EMAIL_FROM = process.env.EMAIL_FROM ?? 'suporte@anotaja.shop';
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  private transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  async sendResetPasswordEmail(email: string, otp: string): Promise<boolean> {
    try {
      await this.transporter.sendMail({
        from: `"Suporte AnotaJá" <${process.env.SMTP_USER}>`,
        to: email,
        subject: '🔐 Código de Recuperação de Senha',
        html: `
          <!DOCTYPE html>
          <html lang="pt-BR">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Recuperação de Senha</title>
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
              <tr>
                <td align="center">
                  <!-- Container Principal -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
                    
                    <!-- Header com Gradiente -->
                    <tr>
                      <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
                        <div style="background-color: rgba(255, 255, 255, 0.2); width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
                          <span style="font-size: 40px;">🔐</span>
                        </div>
                        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">
                          Recuperação de Senha
                        </h1>
                        <p style="margin: 10px 0 0; color: rgba(255, 255, 255, 0.9); font-size: 16px;">
                          Recebemos uma solicitação para redefinir sua senha
                        </p>
                      </td>
                    </tr>
  
                    <!-- Conteúdo -->
                    <tr>
                      <td style="padding: 40px 30px;">
                        <p style="margin: 0 0 24px; color: #374151; font-size: 16px; line-height: 1.6;">
                          Olá! 👋
                        </p>
                        <p style="margin: 0 0 32px; color: #374151; font-size: 16px; line-height: 1.6;">
                          Para redefinir sua senha, use o código de verificação abaixo:
                        </p>
  
                        <!-- Código OTP -->
                        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 32px;">
                          <tr>
                            <td align="center" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 24px;">
                              <div style="background-color: rgba(255, 255, 255, 0.15); border-radius: 8px; padding: 20px; backdrop-filter: blur(10px);">
                                <p style="margin: 0 0 8px; color: rgba(255, 255, 255, 0.9); font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
                                  Seu Código
                                </p>
                                <p style="margin: 0; color: #ffffff; font-size: 42px; font-weight: 800; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                                  ${otp}
                                </p>
                              </div>
                            </td>
                          </tr>
                        </table>
  
                        <!-- Informações Importantes -->
                        <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 8px; padding: 16px 20px; margin: 0 0 32px;">
                          <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.5;">
                            ⏱️ <strong>Importante:</strong> Este código expira em <strong>${OTP_EXPIRES_IN_MINUTES} minutos</strong> por motivos de segurança.
                          </p>
                        </div>
  
                        <p style="margin: 0 0 16px; color: #374151; font-size: 15px; line-height: 1.6;">
                          Se você não solicitou a redefinição de senha, ignore este email. Sua senha permanecerá inalterada.
                        </p>
  
                        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
  
                        <!-- Dicas de Segurança -->
                        <div style="background-color: #f9fafb; border-radius: 8px; padding: 20px; margin: 0 0 24px;">
                          <p style="margin: 0 0 12px; color: #111827; font-size: 15px; font-weight: 600;">
                            🛡️ Dicas de Segurança
                          </p>
                          <ul style="margin: 0; padding-left: 20px; color: #6b7280; font-size: 14px; line-height: 1.8;">
                            <li>Nunca compartilhe este código com ninguém</li>
                            <li>Nossa equipe nunca solicitará este código</li>
                            <li>Use uma senha forte e única</li>
                            <li>Ative a autenticação de dois fatores quando disponível</li>
                          </ul>
                        </div>
                      </td>
                    </tr>
  
                    <!-- Footer -->
                    <tr>
                      <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                        <p style="margin: 0 0 12px; color: #6b7280; font-size: 14px;">
                          Precisa de ajuda? Entre em contato conosco
                        </p>
                        <a href="mailto:${EMAIL_FROM}" style="display: inline-block; margin: 0 0 20px; color: #667eea; text-decoration: none; font-weight: 600; font-size: 14px;">
                          ${EMAIL_FROM}
                        </a>
                        <p style="margin: 0; color: #9ca3af; font-size: 13px; line-height: 1.5;">
                          © ${new Date().getFullYear()} AnotaJá. Todos os direitos reservados.
                        </p>
                        <p style="margin: 8px 0 0; color: #9ca3af; font-size: 12px;">
                          Este é um email automático, por favor não responda.
                        </p>
                      </td>
                    </tr>
                  </table>
  
                  <!-- Mensagem Adicional -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin-top: 20px;">
                    <tr>
                      <td align="center" style="padding: 0 20px;">
                        <p style="margin: 0; color: #9ca3af; font-size: 12px; line-height: 1.5;">
                          Você está recebendo este email porque uma solicitação de redefinição de senha foi feita para sua conta no AnotaJá.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `,
      });

      return true;
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(`Erro ao enviar email para ${email}`, error.stack);
      } else {
        this.logger.error(
          `Erro desconhecido ao enviar email para ${email}`,
          JSON.stringify(error),
        );
      }

      return false;
    }
  }
}
