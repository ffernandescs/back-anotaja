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

  async sendWelcomeEmail(email: string, name: string, trialDays: number): Promise<boolean> {
    try {
      const trialEndDate = new Date();
      trialEndDate.setDate(trialEndDate.getDate() + trialDays);
      const formattedEndDate = trialEndDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

      await this.transporter.sendMail({
        from: `"AnotaJá - Gestão Inteligente" <${process.env.SMTP_USER}>`,
        to: email,
        subject: '🎉 Bem-vindo ao AnotaJá - Seu Trial de 7 Dias Começou!',
        html: `
          <!DOCTYPE html>
          <html lang="pt-BR">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Bem-vindo ao AnotaJá</title>
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
              <tr>
                <td align="center">
                  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1); overflow: hidden;">
                    
                    <!-- Header com Gradiente -->
                    <tr>
                      <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 50px 30px; text-align: center; position: relative;">
                        <div style="background-color: rgba(255, 255, 255, 0.25); width: 100px; height: 100px; border-radius: 50%; margin: 0 auto 24px; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);">
                          <span style="font-size: 50px;">🚀</span>
                        </div>
                        <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 800; letter-spacing: -0.5px; text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                          Bem-vindo ao AnotaJá!
                        </h1>
                        <p style="margin: 12px 0 0; color: rgba(255, 255, 255, 0.95); font-size: 18px; font-weight: 500;">
                          Transforme seu negócio com tecnologia
                        </p>
                      </td>
                    </tr>
          
                    <!-- Conteúdo Principal -->
                    <tr>
                      <td style="padding: 40px 30px;">
                        <p style="margin: 0 0 24px; color: #374151; font-size: 18px; line-height: 1.6;">
                          Olá, <strong style="color: #667eea;">${name}</strong>! 👋
                        </p>
                        <p style="margin: 0 0 32px; color: #374151; font-size: 16px; line-height: 1.7;">
                          Parabéns por dar o primeiro passo rumo à transformação digital do seu negócio! 🎯 Sua conta foi criada com sucesso e você já pode começar a explorar todas as funcionalidades da nossa plataforma.
                        </p>

                        <!-- Trial Info Card -->
                        <div style="background: linear-gradient(135deg, #dbeafe 0%, #e0e7ff 100%); border-radius: 12px; padding: 24px; margin: 0 0 32px; border: 2px solid #3b82f6;">
                          <div style="text-align: center;">
                            <p style="margin: 0 0 8px; color: #1e40af; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">
                              🎁 Período Trial Gratuito
                            </p>
                            <p style="margin: 0 0 16px; color: #1e3a8a; font-size: 36px; font-weight: 800; line-height: 1;">
                              ${trialDays} Dias
                            </p>
                            <p style="margin: 0; color: #1e40af; font-size: 14px; line-height: 1.5;">
                              Válido até <strong>${formattedEndDate}</strong>
                            </p>
                          </div>
                        </div>

                        <!-- Benefícios -->
                        <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; border-radius: 8px; padding: 20px; margin: 0 0 32px;">
                          <p style="margin: 0 0 12px; color: #065f46; font-size: 16px; font-weight: 700;">
                            ✨ O que você ganha com o AnotaJá:
                          </p>
                          <ul style="margin: 0; padding-left: 20px; color: #047857; font-size: 14px; line-height: 2;">
                            <li><strong>Gestão Completa</strong> - Pedidos, estoque, delivery e PDV</li>
                            <li><strong>Cardápio Digital</strong> - Seu próprio site de vendas</li>
                            <li><strong>Entregas Otimizadas</strong> - Rotas inteligentes e rastreamento</li>
                            <li><strong>Relatórios em Tempo Real</strong> - Acompanhe suas vendas</li>
                            <li><strong>Suporte Dedicado</strong> - Estamos aqui para ajudar</li>
                          </ul>
                        </div>

                        <!-- Próximos Passos -->
                        <div style="background: linear-gradient(to right, #fef3c7, #fde68a); border-radius: 12px; padding: 24px; margin: 0 0 32px;">
                          <p style="margin: 0 0 16px; color: #78350f; font-size: 17px; font-weight: 700;">
                            🚀 Comece Agora em 5 Passos:
                          </p>
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="padding: 8px 0;">
                                <span style="display: inline-block; width: 28px; height: 28px; background-color: #f59e0b; color: #ffffff; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 700; margin-right: 12px;">1</span>
                                <span style="color: #92400e; font-size: 14px; font-weight: 600;">Complete o onboarding no painel</span>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 8px 0;">
                                <span style="display: inline-block; width: 28px; height: 28px; background-color: #f59e0b; color: #ffffff; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 700; margin-right: 12px;">2</span>
                                <span style="color: #92400e; font-size: 14px; font-weight: 600;">Configure horários e área de entrega</span>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 8px 0;">
                                <span style="display: inline-block; width: 28px; height: 28px; background-color: #f59e0b; color: #ffffff; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 700; margin-right: 12px;">3</span>
                                <span style="color: #92400e; font-size: 14px; font-weight: 600;">Personalize seu subdomínio e marca</span>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 8px 0;">
                                <span style="display: inline-block; width: 28px; height: 28px; background-color: #f59e0b; color: #ffffff; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 700; margin-right: 12px;">4</span>
                                <span style="color: #92400e; font-size: 14px; font-weight: 600;">Adicione formas de pagamento</span>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding: 8px 0;">
                                <span style="display: inline-block; width: 28px; height: 28px; background-color: #f59e0b; color: #ffffff; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 700; margin-right: 12px;">5</span>
                                <span style="color: #92400e; font-size: 14px; font-weight: 600;">Cadastre produtos e comece a vender! 🎉</span>
                              </td>
                            </tr>
                          </table>
                        </div>

                        <!-- CTA Button -->
                        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 32px;">
                          <tr>
                            <td align="center">
                              <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://app.anotaja.shop'}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-size: 16px; font-weight: 700; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4); transition: transform 0.2s;">
                                🚀 Acessar Minha Conta
                              </a>
                            </td>
                          </tr>
                        </table>

                        <!-- Dica Extra -->
                        <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 8px; padding: 16px 20px; margin: 0 0 24px;">
                          <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
                            💡 <strong>Dica:</strong> Não se preocupe! Após o período trial, você pode escolher o plano que melhor se adapta ao seu negócio. Sem compromisso, sem cartão de crédito necessário agora.
                          </p>
                        </div>

                        <p style="margin: 0; color: #374151; font-size: 15px; line-height: 1.6; text-align: center;">
                          Qualquer dúvida, nossa equipe está pronta para ajudar! 💬
                        </p>
                      </td>
                    </tr>
          
                    <!-- Footer -->
                    <tr>
                      <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                        <p style="margin: 0 0 16px; color: #6b7280; font-size: 14px; font-weight: 600;">
                          Precisa de ajuda? Estamos aqui!
                        </p>
                        <a href="mailto:${EMAIL_FROM}" style="display: inline-block; margin: 0 0 20px; color: #667eea; text-decoration: none; font-weight: 700; font-size: 15px;">
                          📧 ${EMAIL_FROM}
                        </a>
                        <p style="margin: 0 0 8px; color: #9ca3af; font-size: 13px; line-height: 1.5;">
                          © ${new Date().getFullYear()} AnotaJá - Gestão Inteligente para Restaurantes
                        </p>
                        <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                          Todos os direitos reservados.
                        </p>
                      </td>
                    </tr>
                  </table>

                  <!-- Mensagem Adicional -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin-top: 20px;">
                    <tr>
                      <td align="center" style="padding: 0 20px;">
                        <p style="margin: 0; color: #9ca3af; font-size: 12px; line-height: 1.5;">
                          Você está recebendo este email porque criou uma conta no AnotaJá.
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
        this.logger.error(`Erro ao enviar email de boas-vindas para ${email}`, error.stack);
      } else {
        this.logger.error(
          `Erro desconhecido ao enviar email de boas-vindas para ${email}`,
          JSON.stringify(error),
        );
      }

      return false;
    }
  }
}
