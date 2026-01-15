import * as nodemailer from 'nodemailer';
import { Injectable, Logger } from '@nestjs/common';

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
        from: `"Suporte" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'Código de recuperação de senha',
        html: `
          <p>Seu código de verificação é:</p>
          <h2>${otp}</h2>
          <p>Esse código expira em 10 minutos.</p>
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
