import { PartialType } from '@nestjs/mapped-types';
import { CreateBillSplitDto } from './create-billsplit.dto';

export class UpdateBillsplitDto extends PartialType(CreateBillSplitDto) {}
