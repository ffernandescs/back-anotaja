import { PartialType } from '@nestjs/mapped-types';
import { CreateBranchDto } from './create-branch.dto';
import { IsOptional } from 'class-validator';

export class UpdateBranchDto extends PartialType(CreateBranchDto) {
  @IsOptional()
  generalConfig?: {
    enableDelivery?: boolean;
    enableDineIn?: boolean;
    enablePickup?: boolean;
    sendOrdersByWhatsApp?: boolean;
    showPromotionsScreen?: boolean;
    showMenuFooter?: boolean;
    verifyNewCustomerPhone?: boolean;
    hideOrderStatus?: boolean;
    hideStoreAddress?: boolean;
    simplifiedAddressInput?: boolean;
    referencePointRequired?: boolean;
    showCategoriesScreen?: boolean;
    hideFreightCalculation?: boolean;
    autoCompleteOrders?: boolean;
    tableCount?: number;
  };
}
