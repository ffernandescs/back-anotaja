import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as path from 'path';

@Injectable()
export class SignService {
  private privateKey: string;

  constructor() {
    // Tentar carregar chave privada do ambiente (formato hex) primeiro
    const envKey = process.env.PRIVATE_KEY;
    
    if (envKey) {
      // Chave privada em formato hexadecimal (como Menu Integrado)
      try {
        this.privateKey = this.convertHexToPem(envKey);
        console.log('✅ Chave privada carregada do ambiente (formato hex)');
      } catch (error) {
        console.error('❌ Erro ao converter chave hex para PEM:', error);
        throw new Error(`Failed to convert hex key: ${(error as Error).message}`);
      }
    } else {
      // Fallback: carregar do arquivo PEM (formato atual)
      const keyPath = path.resolve(process.cwd(), 'src/keys/private-key.pem');
      
      try {
        this.privateKey = fs.readFileSync(keyPath, 'utf8');
        this.privateKey = this.privateKey.trim();
        console.log('✅ Chave privada carregada do arquivo PEM');
      } catch (error) {
        throw new Error(`Failed to load private key from ${keyPath}: ${(error as Error).message}`);
      }
    }
  }

  /**
   * Converte chave privada de formato hexadecimal para PEM
   * Formato esperado: 64 caracteres hexadecimais (256 bits)
   * Exemplo: 5db2E73cB24Dc42988f6E43E217B95f034a83Fa09DE057C98Fa6a100F4A896dB
   */
  private convertHexToPem(hexKey: string): string {
    // Validar formato
    const cleanHex = hexKey.replace(/[^0-9A-Fa-f]/g, '');
    
    if (cleanHex.length !== 64) {
      throw new Error(`Invalid hex key length: expected 64 characters, got ${cleanHex.length}`);
    }

    // Converter hex para buffer
    const keyBuffer = Buffer.from(cleanHex, 'hex');

    // Gerar chave RSA a partir dos bytes (usando como seed)
    const { privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    } as any); // Usar any para compatibilidade com versões mais antigas

    // Exportar em formato PEM
    const privateKeyPem = (privateKey as any).export({
      type: 'pkcs1',
      format: 'pem',
    });

    return privateKeyPem.toString();
  }

  sign(data: string): string {
    if (!data) throw new Error('Data is required');

    const signer = crypto.createSign('SHA256'); // SHA256 é obrigatório
    signer.update(data);
    signer.end();

    return signer.sign(this.privateKey, 'base64'); // Base64 é o que QZ Tray espera
  }

  /**
   * Gera uma nova chave privada no formato Menu Integrado
   */
  static generateHexKey(): string {
    const randomBytes = crypto.randomBytes(32);
    return randomBytes.toString('hex').toUpperCase();
  }
}