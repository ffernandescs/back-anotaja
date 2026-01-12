import { IsString, IsNotEmpty } from 'class-validator';
import { TableStatus } from '../types';

export class UpdateTableStatusDto {
  @IsString()
  @IsNotEmpty()
  status!: TableStatus;
}
