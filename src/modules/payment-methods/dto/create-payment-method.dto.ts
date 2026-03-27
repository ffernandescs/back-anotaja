// dto/create-payment-method.dto.ts
export class CreatePaymentMethodDto {
  name!: string;
  type?: string;
  icon?: string;
  isActive?: boolean;
}

// dto/update-payment-method.dto.ts
export class UpdatePaymentMethodDto {
  name?: string;
  type?: string;
  icon?: string;
  isActive?: boolean;
}

// dto/branch-assign-payment.dto.ts
export class BranchAssignPaymentDto {
  paymentMethodId!: string;
  forDineIn?: boolean;
  forDelivery?: boolean;
}
