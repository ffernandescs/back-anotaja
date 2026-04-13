import { PartialType } from '@nestjs/mapped-types';
import { CreateStoreOrderDto } from 'src/modules/store/dto/create-store-order.dto';

/**
 * 🔁 UPDATE = tudo opcional
 */
export class UpdateOrderDto extends PartialType(CreateStoreOrderDto) {}