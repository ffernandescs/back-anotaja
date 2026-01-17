import { IsNumber, IsString, Min } from 'class-validator';

export class ConnectComplementOptionDto {
  @IsString()
  id!: string;

  @IsNumber()
  @Min(0)
  price!: number;
}
