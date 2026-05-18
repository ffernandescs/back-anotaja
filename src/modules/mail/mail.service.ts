import * as nodemailer from 'nodemailer';
import { Injectable, Logger } from '@nestjs/common';
import { prisma } from 'lib/prisma';

const OTP_EXPIRES_IN_MINUTES = Number(process.env.OTP_EXPIRES_IN_MINUTES ?? 10);
const EMAIL_FROM = process.env.EMAIL_FROM ?? 'suporte@vaidelli.shop';

export type EmailBranding = {
  appName: string;
  logoUrl: string | null;
  colors: {
    primary: string;
    background: string;
    surface: string;
    text: string;
    muted: string;
    border: string;
    success:string
  };
};

export const defaultEmailTheme: EmailBranding = {
  appName: 'VaiDelli',
  logoUrl: null,
  colors: {
    primary: '#F5B800',
    background: '#0B0B0B',
    surface: '#111111',
    text: '#ffffff',
    muted: '#B3B3B3',
    border: '#1F1F1F',
    success: '#4BB543',
  },
};



export function renderEmailHeader(theme: EmailBranding) {
  const { appName, logoUrl, colors } = theme;

  return `
    <div style="text-align:center;">
      ${
        logoUrl
          ? `<img src="${logoUrl}" style="max-height:50px;object-fit:contain;" />`
          : `<h1 style="margin:0;color:${colors.text};font-size:28px;font-weight:800;">
              ${appName}
            </h1>`
      }
    </div>
  `;
}

export function renderEmailFooter(theme: EmailBranding) {
  const { appName, colors } = theme;

  return `
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="background:${colors.background};
                   padding:30px;
                   text-align:center;
                   border-top:1px solid ${colors.border};">

          <p style="margin:0;color:${colors.muted};font-size:12px;">
            © ${new Date().getFullYear()} ${appName} - Todos os direitos reservados
          </p>

          <p style="margin:6px 0 0;color:${colors.primary};font-size:11px;font-weight:700;">
            SISTEMA DE GESTÃO PARA DELIVERY
          </p>

          <p style="margin:10px 0 0;color:${colors.muted};font-size:11px;">
            Este é um email automático, não responda.
          </p>
        </td>
      </tr>
    </table>
  `;
}

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

  async getTheme(): Promise<EmailBranding> {
    const masterUser = await prisma.masterUser.findFirst({
      where: { active: true },
    });

    if (!masterUser) return defaultEmailTheme;

    const branding = await prisma.masterBrand.findFirst({
      where: { masterUserId: masterUser.id, isDefault: true },
    });
    return {
      appName: branding?.appName || defaultEmailTheme.appName,
      logoUrl: branding?.logoDarkUrl || null,
      colors: {
        primary: branding?.primaryColor || defaultEmailTheme.colors.primary,
        background: defaultEmailTheme.colors.background,
        surface: defaultEmailTheme.colors.surface,
        text: defaultEmailTheme.colors.text,
        muted: defaultEmailTheme.colors.muted,
        border: defaultEmailTheme.colors.border,
        success: defaultEmailTheme.colors.success,
      },
    };
  }

 private async getBrandingHeader() {
    try {
      const masterUser = await prisma.masterUser.findFirst({
        where: { active: true },
      });

      if (!masterUser) {
        return this.defaultBrandHeader();
      }

       if (!masterUser) {
          return {
            configs: {
              ifood_client_id: null,
              ifood_client_secret: null,
              ninetynine_food_api_key: null,
            },
          };
        }

      const branding = await prisma.masterBrand.findFirst({
         where: { masterUserId: masterUser.id, isDefault: true },
      });
      const appName = branding?.appName || 'VaiDelli';

      if (branding?.logoDarkUrl) {
        return `
          <img 
            src="${branding.logoDarkUrl}" 
            alt="${appName}" 
            style="max-height:50px;object-fit:contain;"
          />
        `;
      }

      return `
        <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:800;">
          ${appName}
        </h1>
      `;
    } catch (error) {
      this.logger.error('Erro ao carregar branding do email', error);
      return this.defaultBrandHeader();
    }
  }

  private defaultBrandHeader() {
    return `
      <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:800;">
        VaiDelli
      </h1>
    `;
  }

  async sendResetPasswordEmail(email: string, otp: string): Promise<boolean> {
  try {
    const theme = await this.getTheme();

    const header = renderEmailHeader(theme);
    const footer = renderEmailFooter(theme);

    await this.transporter.sendMail({
      from: `"${theme.appName}" <${process.env.SMTP_USER}>`,
      to: email,
      subject: '🔐 Código de Recuperação de Senha',
      html: `
        <html>
          <body style="margin:0;background:${theme.colors.background};font-family:Arial;">
            <table width="100%" style="padding:40px;">
              <tr>
                <td align="center">
                  <table width="600" style="background:${theme.colors.surface};border-radius:12px;overflow:hidden;">

                    <tr>
                      <td style="background:${theme.colors.background};
                                 padding:40px;
                                 text-align:center;
                                 border-bottom:3px solid ${theme.colors.primary};">
                        ${header}
                      </td>
                    </tr>

                    <tr>
                      <td style="padding:40px;color:${theme.colors.text};">

                        <p>Seu código de recuperação:</p>

                        <div style="
                          background:#111;
                          border:1px solid ${theme.colors.primary};
                          padding:20px;
                          text-align:center;
                          border-radius:10px;
                          font-size:32px;
                          letter-spacing:6px;
                          color:white;
                        ">
                          ${otp}
                        </div>

                        <p style="color:${theme.colors.muted};margin-top:10px;">
                          Expira em 10 minutos
                        </p>

                      </td>
                    </tr>

                    ${footer}

                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
    });

    return true;
  } catch (error) {
    this.logger.error('Erro ao enviar email de reset', error);
    return false;
  }
}


  async sendWelcomeEmail(
  email: string,
  name: string,
  trialDays: number,
): Promise<boolean> {
  try {
    const theme = await this.getTheme();

    const header = renderEmailHeader(theme);
    const footer = renderEmailFooter(theme);

    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + trialDays);

    const formattedEndDate = trialEndDate.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    await this.transporter.sendMail({
      from: `"${theme.appName}" <${process.env.SMTP_USER}>`,
      to: email,
      subject: `🎉 Bem-vindo ao ${theme.appName} - Seu Trial começou!`,
      html: `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Bem-vindo</title>
      </head>

      <body style="margin:0;padding:0;background:${theme.colors.background};font-family:Arial;">

        <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
          <tr>
            <td align="center">

              <table width="100%" cellpadding="0" cellspacing="0"
                style="max-width:600px;background:${theme.colors.surface};border-radius:12px;overflow:hidden;">

                <!-- HEADER -->
                <tr>
                  <td style="background:${theme.colors.background};
                             padding:40px;
                             text-align:center;
                             border-bottom:3px solid ${theme.colors.primary};">

                    ${header}

                    <h1 style="margin:20px 0 0;color:${theme.colors.text};font-size:22px;font-weight:800;">
                      Bem-vindo ao ${theme.appName} 🎉
                    </h1>

                  </td>
                </tr>

                <!-- CONTENT -->
                <tr>
                  <td style="padding:40px;color:${theme.colors.text};">

                    <p style="margin:0 0 16px;">
                      Olá, <strong style="color:${theme.colors.primary};">${name}</strong> 👋
                    </p>

                    <p style="margin:0 0 24px;color:${theme.colors.muted};line-height:1.6;">
                      Sua conta foi criada com sucesso. Você já pode começar a usar a plataforma.
                    </p>

                    <!-- TRIAL CARD -->
                    <div style="
                      background:${theme.colors.background};
                      border:1px solid ${theme.colors.primary};
                      border-radius:10px;
                      padding:24px;
                      margin-bottom:24px;
                      text-align:center;
                    ">

                      <p style="margin:0 0 8px;color:${theme.colors.muted};font-size:12px;font-weight:700;">
                        PERÍODO TRIAL
                      </p>

                      <p style="margin:0 0 12px;color:${theme.colors.primary};font-size:34px;font-weight:900;">
                        ${trialDays} DIAS
                      </p>

                      <p style="margin:0;color:${theme.colors.text};font-size:13px;">
                        Válido até <strong>${formattedEndDate}</strong>
                      </p>

                    </div>

                    <!-- BENEFÍCIOS -->
                    <div style="
                      background:${theme.colors.background};
                      border-left:4px solid ${theme.colors.primary};
                      border-radius:8px;
                      padding:20px;
                      margin-bottom:24px;
                    ">

                      <p style="margin:0 0 12px;color:${theme.colors.primary};font-weight:700;">
                        O que você ganha:
                      </p>

                      <ul style="margin:0;padding-left:18px;color:${theme.colors.muted};line-height:1.8;">
                        <li>Gestão completa de pedidos</li>
                        <li>Cardápio digital</li>
                        <li>Controle de entregas</li>
                        <li>Relatórios em tempo real</li>
                        <li>Suporte dedicado</li>
                      </ul>

                    </div>

                    <!-- CTA -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center">

                          <a href="${process.env.NEXT_PUBLIC_APP_URL}"
                            style="display:inline-block;
                            background:${theme.colors.primary};
                            color:${theme.colors.text || '#000'};
                            text-decoration:none;
                            padding:14px 40px;
                            border-radius:8px;
                            font-weight:800;">
                            ACESSAR SISTEMA
                          </a>

                        </td>
                      </tr>
                    </table>

                    <!-- DICA -->
                    <div style="
                      background:${theme.colors.background};
                      border:1px solid ${theme.colors.border || theme.colors.primary};
                      border-radius:8px;
                      padding:16px;
                      margin-top:24px;
                    ">

                      <p style="margin:0;color:${theme.colors.muted};font-size:13px;line-height:1.6;">
                        💡 Após o trial, você poderá escolher o plano ideal para o seu negócio.
                      </p>

                    </div>

                  </td>
                </tr>

                <!-- FOOTER -->
                ${footer}

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
      this.logger.error(`Erro desconhecido ao enviar email de boas-vindas`, JSON.stringify(error));
    }

    return false;
  }
}

async sendClientActivationEmail(
  data: {
    email: string;
    companyName: string;
    userName: string;
    userEmail: string;
    password: string;
    adminUrl: string;
  },
): Promise<boolean> {
  try {
    const theme = await this.getTheme();

    const header = renderEmailHeader(theme);
    const footer = renderEmailFooter(theme);

    await this.transporter.sendMail({
      from: `"${theme.appName}" <${process.env.SMTP_USER}>`,
      to: data.email,
      subject: '🚀 Sua conta foi ativada - Acesse o Painel Admin',
      html: `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Ativação de Conta</title>
      </head>

      <body style="margin:0;padding:0;background:${theme.colors.background};font-family:Arial;">

        <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
          <tr>
            <td align="center">

              <table width="100%" cellpadding="0" cellspacing="0"
                style="max-width:600px;background:${theme.colors.surface};border-radius:12px;overflow:hidden;">

                <!-- HEADER -->
                <tr>
                  <td style="background:${theme.colors.background};
                             padding:40px;
                             text-align:center;
                             border-bottom:3px solid ${theme.colors.primary};">

                    ${header}

                    <h1 style="margin:20px 0 0;color:${theme.colors.text};font-size:24px;font-weight:800;">
                      Conta ativada com sucesso 🚀
                    </h1>

                    <p style="margin:8px 0 0;color:${theme.colors.muted};font-size:14px;">
                      ${data.companyName}
                    </p>

                  </td>
                </tr>

                <!-- CONTENT -->
                <tr>
                  <td style="padding:40px;color:${theme.colors.text};">

                    <p style="margin:0 0 16px;">
                      Olá, <strong style="color:${theme.colors.primary};">${data.userName}</strong> 👋
                    </p>

                    <p style="margin:0 0 24px;color:${theme.colors.muted};line-height:1.6;">
                      Sua conta foi ativada com sucesso. Aqui estão suas credenciais de acesso ao painel administrativo.
                    </p>

                    <!-- CREDENCIAIS -->
                    <div style="
                      background:${theme.colors.background};
                      border:1px solid ${theme.colors.primary};
                      border-radius:10px;
                      padding:20px;
                      margin-bottom:24px;
                    ">

                      <p style="margin:0 0 12px;color:${theme.colors.primary};font-weight:700;">
                        Credenciais de acesso
                      </p>

                      <p style="margin:0 0 8px;color:${theme.colors.text};">
                        <strong>Email:</strong> ${data.userEmail}
                      </p>

                      <p style="margin:0;color:${theme.colors.text};">
                        <strong>Senha:</strong>
                        <span style="color:${theme.colors.primary};font-weight:700;letter-spacing:2px;">
                          ${data.password}
                        </span>
                      </p>

                      <p style="margin:16px 0 0;color:${theme.colors.muted};font-size:12px;">
                        ⚠️ Recomendamos alterar sua senha no primeiro acesso.
                      </p>
                    </div>

                    <!-- CTA -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center">
                          <a href="${data.adminUrl}"
                            style="display:inline-block;
                            background:${theme.colors.primary};
                            color:${theme.colors.text || '#000'};
                            text-decoration:none;
                            padding:14px 40px;
                            border-radius:8px;
                            font-weight:800;">
                            ACESSAR PAINEL
                          </a>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>

                <!-- FOOTER -->
                ${footer}

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
      this.logger.error(`Erro ao enviar email de ativação para ${data.email}`, error.stack);
    } else {
      this.logger.error(`Erro desconhecido ao enviar email de ativação`, JSON.stringify(error));
    }

    return false;
  }
}

async sendCompanyInterestEmail(
  customerData: {
    name: string;
    companyName: string;
    document: string;
    email: string;
    phone: string;
    segment?: string;
    street: string;
    number: string;
    complement?: string;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
    reference?: string;
  },
): Promise<boolean> {
  const masterEmail = process.env.MASTER_EMAIL || 'master@vaidelli.shop';

  try {
    const theme = await this.getTheme();

    const header = renderEmailHeader(theme);
    const footer = renderEmailFooter(theme);

    await this.transporter.sendMail({
      from: `"${theme.appName}" <${process.env.SMTP_USER}>`,
      to: masterEmail,
      subject: `🎯 Novo Interesse em Testar o Sistema - ${customerData.companyName}`,
      html: `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Novo Interesse</title>
      </head>

      <body style="margin:0;padding:0;background:${theme.colors.background};font-family:Arial;">

        <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
          <tr>
            <td align="center">

              <table width="100%" cellpadding="0" cellspacing="0"
                style="max-width:600px;background:${theme.colors.surface};border-radius:12px;overflow:hidden;">

                <!-- HEADER -->
                <tr>
                  <td style="background:${theme.colors.background};
                             padding:40px;
                             text-align:center;
                             border-bottom:3px solid ${theme.colors.primary};">

                    ${header}

                    <h1 style="margin:20px 0 0;color:${theme.colors.text};font-size:22px;font-weight:800;">
                      Novo interesse recebido 🎯
                    </h1>

                    <p style="margin:8px 0 0;color:${theme.colors.muted};font-size:14px;">
                      ${customerData.companyName}
                    </p>

                  </td>
                </tr>

                <!-- CONTENT -->
                <tr>
                  <td style="padding:40px;color:${theme.colors.text};">

                    <p style="margin:0 0 24px;color:${theme.colors.muted};line-height:1.6;">
                      Um novo cliente demonstrou interesse no sistema VaiDelli.
                    </p>

                    <!-- CARD CLIENTE -->
                    <div style="
                      background:${theme.colors.background};
                      border:1px solid ${theme.colors.border || theme.colors.primary};
                      border-radius:10px;
                      padding:20px;
                      margin-bottom:24px;
                    ">

                      <p style="margin:0 0 12px;color:${theme.colors.primary};font-weight:700;">
                        Dados do cliente
                      </p>

                      <p style="margin:0 0 6px;color:${theme.colors.text};">
                        <strong>Nome:</strong> ${customerData.name}
                      </p>

                      <p style="margin:0 0 6px;color:${theme.colors.text};">
                        <strong>Email:</strong> ${customerData.email}
                      </p>

                      <p style="margin:0 0 6px;color:${theme.colors.text};">
                        <strong>Telefone:</strong> ${customerData.phone}
                      </p>

                      <p style="margin:0;color:${theme.colors.text};">
                        <strong>Empresa:</strong> ${customerData.companyName}
                      </p>

                    </div>

                    <!-- ENDEREÇO -->
                    <div style="
                      background:${theme.colors.background};
                      border:1px solid ${theme.colors.border || theme.colors.primary};
                      border-radius:10px;
                      padding:20px;
                      margin-bottom:24px;
                    ">

                      <p style="margin:0 0 12px;color:${theme.colors.primary};font-weight:700;">
                        Endereço
                      </p>

                      <p style="margin:0;color:${theme.colors.text};line-height:1.6;">
                        ${customerData.street}, ${customerData.number}<br/>
                        ${customerData.neighborhood} - ${customerData.city}/${customerData.state}<br/>
                        CEP: ${customerData.zipCode}
                      </p>

                    </div>

                    <!-- CTA -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center">

                          <a href="mailto:${customerData.email}"
                            style="display:inline-block;
                            background:${theme.colors.primary};
                            color:${theme.colors.text || '#000'};
                            text-decoration:none;
                            padding:12px 28px;
                            border-radius:8px;
                            font-weight:700;
                            margin-right:8px;">
                            Enviar Email
                          </a>

                          <a href="tel:${customerData.phone}"
                            style="display:inline-block;
                            background:${theme.colors.success || '#10b981'};
                            color:#fff;
                            text-decoration:none;
                            padding:12px 28px;
                            border-radius:8px;
                            font-weight:700;">
                            Ligar
                          </a>

                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>

                <!-- FOOTER -->
                ${footer}

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
      this.logger.error(`Erro ao enviar email de interesse para ${masterEmail}`, error.stack);
    } else {
      this.logger.error(`Erro desconhecido ao enviar email de interesse`, JSON.stringify(error));
    }

    return false;
  }
}
}
