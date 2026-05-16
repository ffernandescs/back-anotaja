/** Payload do evento Socket.IO `order-channel-campaign:update`. */
export interface OrderChannelCampaignWsPayload {
  campaignId?: string;
  orderOriginId?: string;
}

/** Contrato para emitir atualizações de campanha (evita import circular no WhatsAppService). */
export interface OrderChannelCampaignWsEmitter {
  emitOrderChannelCampaignUpdate(
    branchId: string,
    payload: OrderChannelCampaignWsPayload,
  ): void;
}
