import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as path from 'path';

@Injectable()
export class SignService {
  private privateKey: string;

  constructor() {
    const keyPath = path.resolve(process.cwd(), 'src/keys/private-key.pem');
    
    try {
      this.privateKey = fs.readFileSync(keyPath, 'utf8');
      // Remove any extra whitespace and ensure proper formatting
      this.privateKey = this.privateKey.trim();
    } catch (error) {
      throw new Error(`Failed to load private key from ${keyPath}: ${(error as Error).message}`);
    }
  }

    sign(data: string): string {
        if (!data) throw new Error('Data is required');

        const signer = crypto.createSign('SHA256'); // ⚠️ SHA256 é obrigatório
        signer.update(data);
        signer.end();

        return signer.sign(this.privateKey, 'base64'); // Base64 é o que QZ Tray espera
    }
}