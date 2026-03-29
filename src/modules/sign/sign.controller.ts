import { Body, Controller, Post, BadRequestException, Res } from '@nestjs/common';
import { Response } from 'express';
import { SignService } from './sign.service';
import { Public } from '../../common/decorators/public.decorator';

@Controller('sign')
export class SignController {
  constructor(private readonly signService: SignService) {}

  @Public()
  @Post()
  sign(@Body('data') data: string, @Res() res: Response) {
    if (!data) {
      throw new BadRequestException('Data field is required in request body');
    }
    
    const signature = this.signService.sign(data);
    
    // QZ Tray espera texto puro, não JSON
    res.setHeader('Content-Type', 'text/plain');
    res.send(signature);
  }
}