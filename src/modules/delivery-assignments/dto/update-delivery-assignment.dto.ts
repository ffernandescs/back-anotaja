import { PartialType } from '@nestjs/mapped-types';
import { CreateDeliveryAssignmentDto } from './create-delivery-assignment.dto';

export class UpdateDeliveryAssignmentDto extends PartialType(CreateDeliveryAssignmentDto) {}
