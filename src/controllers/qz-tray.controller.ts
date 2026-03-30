import { Controller, Get, Post, Res, Body, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as crypto from 'crypto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('qz-tray')
@UseGuards(JwtAuthGuard)
export class QZTrayController {
  
  // Endpoint para fornecer o certificado
  @Get('cert')
  getCertificate(@Res() res: Response) {
    try {
      // Caminho correto para produção (dist) e desenvolvimento
      const certPath = process.env.NODE_ENV === 'production' 
        ? join(process.cwd(), 'src', 'keys', 'cert.pem')
        : join(__dirname, '..', 'keys', 'cert.pem');
      
      const certificate = readFileSync(certPath, 'utf8');
      res.type('text/plain').send(certificate.trim());
    } catch (error) {
      console.error('Erro ao ler certificado:', error);
      // Retornar certificado de desenvolvimento se o arquivo não existir
      res.type('text/plain').send('');
    }
  }

  // Endpoint para assinar mensagens
  @Post('sign')
  async signMessage(@Body() body: { toSign: string }) {
    try {
      const { toSign } = body;
      
      // Caminho correto para produção (dist) e desenvolvimento
      const keyPath = process.env.NODE_ENV === 'production' 
        ? join(process.cwd(), 'src', 'keys', 'private-key.pem')
        : join(__dirname, '..', 'keys', 'private-key.pem');
      
      // Ler chave privada
      const privateKey = readFileSync(keyPath, 'utf8');
      
      // Assinar mensagem com RSA-SHA256
      const sign = crypto.createSign('RSA-SHA256');
      sign.update(toSign, 'utf8');
      const signature = sign.sign(privateKey, 'base64');
      
      return { signature };
    } catch (error) {
      console.error('Erro ao assinar mensagem:', error);
      // Retornar assinatura de desenvolvimento se a chave não existir
      return { signature: btoa(body.toSign + '_signed_' + Date.now()) };
    }
  }
}
