import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { FoodDeliveryIntegrationsService } from './food-delivery-integrations.service';
import { IfoodService } from './ifood.service';
import { IfoodPollingService } from './ifood-polling.service';
import { IfoodOrderProcessorService } from './ifood-order-processor.service';
import { IfoodProductMappingService, UpsertProductMappingDto } from './ifood-product-mapping.service';
import { NinetyNineFoodService } from './ninetynine-food.service';
import { UpdateFoodDeliveryConfigDto } from './dto/food-delivery.dto';
import { Public } from 'src/common/decorators/public.decorator';
import { prisma } from '../../../lib/prisma';

@Controller('food-delivery-integrations')
@UseGuards(JwtAuthGuard)
export class FoodDeliveryIntegrationsController {
  private readonly logger = new Logger(FoodDeliveryIntegrationsController.name);

  constructor(
    private readonly service: FoodDeliveryIntegrationsService,
    private readonly ifoodService: IfoodService,
    private readonly ifoodPollingService: IfoodPollingService,
    private readonly ifoodOrderProcessor: IfoodOrderProcessorService,
    private readonly ifoodProductMappingService: IfoodProductMappingService,
    private readonly ninetyNineFoodService: NinetyNineFoodService,
  ) {}

  // ─── iFood Webhook (recebe eventos em tempo real) ──────────────────────────

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleIfoodWebhook(@Body() payload: any) {
    this.logger.log(`Webhook iFood recebido: code=${payload.code} orderId=${payload.orderId}`);

    // iFood exige resposta 200 imediata — processa de forma assíncrona
    setImmediate(() => this.processWebhookAsync(payload));

    return { ok: true };
  }

  private async processWebhookAsync(payload: any) {
    try {
      const { code, orderId, merchantId } = payload;

      if (!code || code === 'KEEPALIVE') return;

      // Precisamos do orderId para eventos de pedido
      if (!orderId) {
        this.logger.warn(`Webhook iFood sem orderId: ${JSON.stringify(payload)}`);
        return;
      }

      // Descobre qual branch corresponde a este merchantId
      const config = await prisma.foodDeliveryIntegrationConfig.findFirst({
        where: {
          ifoodEnabled: true,
          ifoodMerchantId: merchantId,
        },
      });

      if (!config) {
        this.logger.warn(
          `Webhook iFood: nenhuma branch configurada para merchantId ${merchantId}`,
        );
        return;
      }

      const event = {
        id: payload.id ?? `webhook-${Date.now()}`,
        code,
        correlationId: payload.correlationId ?? '',
        createdAt: payload.createdAt ?? new Date().toISOString(),
        orderId,
        merchantId,
      };

      await this.ifoodOrderProcessor.processEvent(event, config.branchId);

      // ACK do evento para o iFood (evita reenvio)
      try {
        await this.ifoodService.acknowledgeEvents([{ id: event.id, code: event.code }]);
      } catch (ackErr: any) {
        this.logger.warn(`Falha ao fazer ACK do evento ${event.id}: ${ackErr.message}`);
      }
    } catch (err: any) {
      this.logger.error(`Erro ao processar webhook iFood: ${err.message}`, err.stack);
    }
  }

  // ─── Config ────────────────────────────────────────────────────────────────

  @Get(':branchId')
  async getConfig(@Param('branchId') branchId: string) {
    return this.service.getConfig(branchId);
  }

  @Put(':branchId')
  async updateConfig(
    @Param('branchId') branchId: string,
    @Body() dto: UpdateFoodDeliveryConfigDto,
  ) {
    return this.service.updateConfig(branchId, dto);
  }

  // ─── iFood — Auth & Polling ────────────────────────────────────────────────

  @Get(':branchId/ifood/test-auth')
  async testIfoodAuth() {
    const token = await this.ifoodService.getAccessToken();
    return { ok: true, tokenPreview: `${token.slice(0, 10)}...` };
  }

  @Post(':branchId/ifood/poll')
  @HttpCode(HttpStatus.OK)
  async pollIfoodNow(@Param('branchId') branchId: string) {
    return this.ifoodPollingService.triggerPollForBranch(branchId);
  }

  // ─── iFood — Order Management ──────────────────────────────────────────────

  @Post(':branchId/ifood/orders/:ifoodOrderId/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmIfoodOrder(@Param('ifoodOrderId') ifoodOrderId: string) {
    await this.ifoodService.confirmOrder(ifoodOrderId);
    return { ok: true };
  }

  @Post(':branchId/ifood/orders/:ifoodOrderId/start-preparation')
  @HttpCode(HttpStatus.OK)
  async startIfoodPreparation(@Param('ifoodOrderId') ifoodOrderId: string) {
    await this.ifoodService.startPreparation(ifoodOrderId);
    return { ok: true };
  }

  @Post(':branchId/ifood/orders/:ifoodOrderId/ready')
  @HttpCode(HttpStatus.OK)
  async markIfoodReady(@Param('ifoodOrderId') ifoodOrderId: string) {
    await this.ifoodService.readyToPickup(ifoodOrderId);
    return { ok: true };
  }

  @Post(':branchId/ifood/orders/:ifoodOrderId/dispatch')
  @HttpCode(HttpStatus.OK)
  async dispatchIfoodOrder(@Param('ifoodOrderId') ifoodOrderId: string) {
    await this.ifoodService.dispatch(ifoodOrderId);
    return { ok: true };
  }

  @Post(':branchId/ifood/orders/:ifoodOrderId/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelIfoodOrder(
    @Param('ifoodOrderId') ifoodOrderId: string,
    @Body() body: { reason: string },
  ) {
    await this.ifoodService.requestCancellation(ifoodOrderId, body.reason);
    return { ok: true };
  }

  @Get(':branchId/ifood/orders/:ifoodOrderId/cancel-reasons')
  async getIfoodCancelReasons(@Param('ifoodOrderId') ifoodOrderId: string) {
    return this.ifoodService.getCancellationReasons(ifoodOrderId);
  }

  // ─── iFood — Product Mappings ──────────────────────────────────────────────

  @Get(':branchId/ifood/product-mappings')
  async listProductMappings(@Param('branchId') branchId: string) {
    return this.ifoodProductMappingService.listMappings(branchId);
  }

  @Get(':branchId/ifood/product-mappings/unmapped')
  async getUnmappedItems(@Param('branchId') branchId: string) {
    return this.ifoodProductMappingService.getUnmappedItems(branchId);
  }

  @Put(':branchId/ifood/product-mappings')
  async upsertProductMapping(
    @Param('branchId') branchId: string,
    @Body() dto: UpsertProductMappingDto,
  ) {
    return this.ifoodProductMappingService.upsertMapping(branchId, dto);
  }

  @Delete(':branchId/ifood/product-mappings/:externalCode')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteProductMapping(
    @Param('branchId') branchId: string,
    @Param('externalCode') externalCode: string,
  ) {
    await this.ifoodProductMappingService.deleteMapping(branchId, externalCode);
  }

  // ─── 99Food ────────────────────────────────────────────────────────────────

  @Get(':branchId/99food/test-auth')
  async testNinetyNineFoodAuth() {
    return this.ninetyNineFoodService.testAuth();
  }

  @Get(':branchId/99food/orders')
  async pollNinetyNineFoodOrders(@Param('branchId') branchId: string) {
    const config = await this.service.getConfig(branchId);
    if (!config.ninetyNineFoodEnabled || !config.ninetyNineFoodMerchantId) {
      return { orders: [] };
    }
    return this.ninetyNineFoodService.getOrders(config.ninetyNineFoodMerchantId);
  }
}