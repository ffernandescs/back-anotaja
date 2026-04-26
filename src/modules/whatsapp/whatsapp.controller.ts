// whatsapp.controller.ts — topo do arquivo, substitua os imports existentes

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Request,
  Req,           // ← adicionar
  Res,           // ← já estava no seu import original? confirme
  UseGuards,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
  Query,
  Logger,        // ← adicionar
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response as ExpressResponse } from 'express'; // ← import correto do Express
import { Request as ExpressRequest } from 'express';   // ← para tipar o req do proxy
import { WhatsAppService } from './whatsapp.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Public } from '../../common/decorators/public.decorator'; // ← adicionar
import {
  UpdateWhatsAppConfigDto,
  SendTestMessageDto,
  FetchMessagesDto,
  SendCrmMessageDto,
} from './dto/whatsapp.dto';

@Controller('whatsapp')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);
  constructor(private readonly whatsappService: WhatsAppService) {}

  @Get('config')
  async getConfig(@Request() req) {
    try {
      const branchId = req.user.branchId;
      return this.whatsappService.getConfig(branchId);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Put('config')
  async updateConfig(@Request() req, @Body() dto: UpdateWhatsAppConfigDto) {
    try {
      const branchId = req.user.branchId;
      const config = await this.whatsappService.updateConfig(branchId, dto);
      return { message: 'Configuracoes atualizadas com sucesso', config };
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Post('setup')
  async setup(@Request() req) {
    try {
      const branchId = req.user.branchId;
      return this.whatsappService.setup(branchId);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Post('enable-sync-history')
  async enableSyncHistory(@Request() req) {
    try {
      const branchId = req.user.branchId;
      return this.whatsappService.enableSyncHistory(branchId);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Post('connect')
  async connect(@Request() req) {
    try {
      const branchId = req.user.branchId;
      return this.whatsappService.connect(branchId);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Delete('disconnect')
  async disconnect(@Request() req) {
    try {
      const branchId = req.user.branchId;
      return this.whatsappService.disconnect(branchId);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Get('status')
  async getStatus(@Request() req) {
    try {
      const branchId = req.user.branchId;
      return this.whatsappService.getStatus(branchId);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Post('test')
  async sendTestMessage(@Request() req, @Body() dto: SendTestMessageDto) {
    try {
      const branchId = req.user.branchId;
      return this.whatsappService.sendTestMessage(branchId, dto);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  // ─── CRM Endpoints ──────────────────────────────────────────────

  @Get('crm/chats')
  async fetchChats(@Request() req) {
    try {
      const branchId = req.user.branchId;
      return this.whatsappService.fetchChats(branchId);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Post('crm/messages')
  async fetchMessages(@Request() req, @Body() dto: FetchMessagesDto) {
    try {
      const branchId = req.user.branchId;
      return this.whatsappService.fetchMessages(branchId, dto);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Post('crm/send')
  async sendCrmMessage(@Request() req, @Body() dto: SendCrmMessageDto) {
    try {
      const branchId = req.user.branchId;
      return this.whatsappService.sendCrmMessage(branchId, dto);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Post('crm/send-media')
  @UseInterceptors(FileInterceptor('file'))
  async sendCrmMedia(
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { jid: string; caption?: string },
  ) {
    try {
      const branchId = req.user.branchId;
      return this.whatsappService.sendCrmMedia(branchId, body.jid, file, body.caption);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Public()
  @Get('crm/media-proxy')
  async mediaProxy(
    @Query('url') mediaUrl: string,
    @Query('messageId') messageId: string,
    @Query('jid') jid: string,
    @Query('branchId') branchId: string,
    @Res() res: ExpressResponse,
  ) {
    try {
      // Tenta usar Evolution API para descriptografar a mídia
      const config = await this.whatsappService.getFullConfigPublic(branchId).catch(() => null);

      if (config?.instanceName) {
        const base64Result = await fetch(
          `${process.env.EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${config.instanceName}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: process.env.EVOLUTION_API_KEY!,
            } as HeadersInit,
            body: JSON.stringify({
              message: { key: { id: messageId, remoteJid: jid } },
              convertToMp4: false,
            }),
          },
        );

        if (base64Result.ok) {
          const data = await base64Result.json();
          const base64 = data?.base64 || data?.data;
          const mimetype = data?.mimetype || 'audio/ogg';

          if (base64) {
            const buffer = Buffer.from(base64, 'base64');
            res.setHeader('Content-Type', mimetype);
            res.setHeader('Content-Length', buffer.length);
            res.setHeader('Cache-Control', 'private, max-age=3600');
            return res.send(buffer);
          }
        }
      }

      // Fallback: proxy direto da URL do WhatsApp
      return this.proxyDirectUrl(mediaUrl, res);

    } catch (err) {
      this.logger.error('[media-proxy] Erro:', err);
      return this.proxyDirectUrl(mediaUrl, res);
    }
  }

  

 private async proxyDirectUrl(url: string, res: ExpressResponse) { // ← tipo correto
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'WhatsApp/2.24.6.77 A' } as HeadersInit,
    });
    if (!resp.ok) return res.status(502).send('Falha no proxy');
    const buf = Buffer.from(await resp.arrayBuffer());
    res.setHeader('Content-Type', resp.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.send(buf);
  }

  @Post('crm/mark-as-read')
  async markChatAsRead(@Request() req, @Body() body: { jid: string }) {
    try {
      const branchId = req.user.branchId;
      return this.whatsappService.markChatAsRead(branchId, body.jid);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Post('crm/webhook/register')
  async registerWebhook(@Request() req, @Body() body: { webhookUrl: string }) {
    try {
      const branchId = req.user.branchId;
      return this.whatsappService.registerWebhook(branchId, body.webhookUrl);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  
}
