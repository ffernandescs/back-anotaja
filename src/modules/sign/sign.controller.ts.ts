import { Body, Controller, Post, BadRequestException } from '@nestjs/common';
import { SignService } from './sign.service';

@Controller('sign')
export class SignController {
  constructor(private readonly signService: SignService) {}

  @Post()
  sign(@Body('data') data: string) {
    if (!data) {
      throw new BadRequestException('Data field is required in request body');
    }
    
    return this.signService.sign(data);
  }
}