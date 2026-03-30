import { Controller, Get, Post } from '@nestjs/common';
import { SignService } from './sign.service';
import { Public } from '../../common/decorators/public.decorator';

@Controller('admin/sign')
export class SignManagementController {
  constructor(private readonly signService: SignService) {}

  @Public()
  @Get('generate-key')
  generateKey() {
    const newKey = SignService.generateHexKey();
    
    return {
      success: true,
      data: {
        privateKey: newKey,
        format: 'hexadecimal',
        length: 64,
        bits: 256,
        example: '5db2E73cB24Dc42988f6E43E217B95f034a83Fa09DE057C98Fa6a100F4A896dB'
      },
      message: 'Chave privada gerada com sucesso',
      instructions: {
        env: `PRIVATE_KEY=${newKey}`,
        usage: 'Adicione esta chave ao seu arquivo .env',
        restart: 'Reinicie o servidor para aplicar as alterações'
      }
    };
  }

  @Public()
  @Get('status')
  getStatus() {
    const envKey = process.env.PRIVATE_KEY;
    
    return {
      success: true,
      data: {
        hasEnvKey: !!envKey,
        keyFormat: envKey ? 'hexadecimal' : 'PEM file',
        keyLength: envKey ? envKey.replace(/[^0-9A-Fa-f]/g, '').length : 'file-based',
        service: 'QZ Tray Sign Service'
      },
      message: envKey 
        ? 'Usando chave privada do ambiente (formato Menu Integrado)' 
        : 'Usando chave privada de arquivo PEM (formato tradicional)'
    };
  }
}
