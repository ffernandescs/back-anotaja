import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as path from 'path';

@Injectable()
export class SignService {
  private privateKey: string;

  constructor() {
    const keyPath = path.resolve(process.cwd(), 'src/keys/private-key.pem');
    
    this.privateKey = fs.readFileSync(keyPath, 'utf8');
  }

  sign(data: string): string {
    const signer = crypto.createSign('SHA256');
    signer.update(data);
    signer.end();

    return signer.sign(this.privateKey, 'base64');
  }
}