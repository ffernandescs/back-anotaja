import { OrderPaymentDto } from "src/modules/store/dto/create-store-order.dto";
import { CreateOrderItemDto, DeliveryTypeDto } from "./create-order-item.dto";


export type NormalizedOrder = {
  deliveryType: DeliveryTypeDto;
  items: CreateOrderItemDto[];
  payments: OrderPaymentDto[];
};