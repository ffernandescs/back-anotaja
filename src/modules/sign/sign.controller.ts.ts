import { Body, Controller, Post } from '@nestjs/common';
import { SignService } from './sign.service';

@Controller('sign')
export class SignController {
  constructor(private readonly signService: SignService) {}

  @Post()
  sign(@Body('data') data: string) {
    return this.signService.sign(data);
  }
}