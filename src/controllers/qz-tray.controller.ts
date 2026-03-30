import { Controller, Get, Post, Res, Body } from '@nestjs/common';
import { Response } from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as crypto from 'crypto';

@Controller('qz-tray')
export class QZTrayController {
  
  // Endpoint para fornecer o certificado
  @Get('cert')
  getCertificate(@Res() res: Response) {
    try {
      console.log('🔍 Buscando certificado...');
      
      // Tentar múltiplos caminhos
      const possiblePaths = [
        join(__dirname, '..', 'keys', 'cert.pem'), // desenvolvimento
        join(__dirname, 'keys', 'cert.pem'), // produção (dist/src/keys)
        join(process.cwd(), 'src', 'keys', 'cert.pem'), // alternativa
        join(process.cwd(), 'dist', 'src', 'keys', 'cert.pem'), // produção
      ];
      
      let certPath = '';
      let certificate = '';
      
      for (const path of possiblePaths) {
        try {
          console.log(`🔍 Tentando caminho: ${path}`);
          certificate = readFileSync(path, 'utf8');
          certPath = path;
          console.log(`✅ Certificado encontrado em: ${path}`);
          break;
        } catch (e) {
          console.log(`❌ Não encontrado: ${path}`);
        }
      }
      
      if (!certificate) {
        console.log('⚠️ Certificado não encontrado, usando fallback');
        res.type('text/plain').send('');
        return;
      }
      
      res.type('text/plain').send(certificate.trim());
    } catch (error) {
      console.error('❌ Erro ao ler certificado:', error);
      res.type('text/plain').send('');
    }
  }

  // Endpoint para assinar mensagens
  @Post('sign')
  async signMessage(@Body() body: { toSign: string }) {
    try {
      const { toSign } = body;
      console.log('🔐 Assinando mensagem:', toSign.substring(0, 50) + '...');
      
      // Tentar múltiplos caminhos
      const possiblePaths = [
        join(__dirname, '..', 'keys', 'private-key.pem'), // desenvolvimento
        join(__dirname, 'keys', 'private-key.pem'), // produção (dist/src/keys)
        join(process.cwd(), 'src', 'keys', 'private-key.pem'), // alternativa
        join(process.cwd(), 'dist', 'src', 'keys', 'private-key.pem'), // produção
      ];
      
      let privateKey = '';
      let keyPath = '';
      
      for (const path of possiblePaths) {
        try {
          console.log(`🔍 Tentando chave: ${path}`);
          privateKey = readFileSync(path, 'utf8');
          keyPath = path;
          console.log(`✅ Chave encontrada em: ${path}`);
          break;
        } catch (e) {
          console.log(`❌ Chave não encontrada: ${path}`);
        }
      }
      
      if (!privateKey) {
        console.log('⚠️ Chave não encontrada, usando fallback');
        return { signature: btoa(body.toSign + '_signed_' + Date.now()) };
      }
      
      // Assinar mensagem com RSA-SHA256
      const sign = crypto.createSign('RSA-SHA256');
      sign.update(toSign, 'utf8');
      const signature = sign.sign(privateKey, 'base64');
      
      console.log('✅ Assinatura RSA gerada com sucesso');
      return { signature };
    } catch (error) {
      console.error('❌ Erro ao assinar mensagem:', error);
      // Retornar assinatura de desenvolvimento se a chave não existir
      return { signature: btoa(body.toSign + '_signed_' + Date.now()) };
    }
  }
}
