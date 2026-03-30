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
      const certPath = join(__dirname, '..', 'keys', 'cert.pem');
      const certificate = readFileSync(certPath, 'utf8');
      res.type('text/plain').send(certificate.trim());
    } catch (error) {
      console.error('Erro ao ler certificado:', error);
      res.status(500).send('Erro ao carregar certificado');
    }
  }

  // Endpoint para assinar mensagens
  @Post('sign')
  async signMessage(@Body() body: { toSign: string }) {
    try {
      const { toSign } = body;
      
      // Ler chave privada
      const keyPath = join(__dirname, '..', 'keys', 'private-key.pem');
      const privateKey = readFileSync(keyPath, 'utf8');
      
      // Assinar mensagem com RSA-SHA256
      const sign = crypto.createSign('RSA-SHA256');
      sign.update(toSign, 'utf8');
      const signature = sign.sign(privateKey, 'base64');
      
      return { signature };
    } catch (error) {
      console.error('Erro ao assinar mensagem:', error);
      throw new Error('Erro ao assinar mensagem');
    }
  }
}
