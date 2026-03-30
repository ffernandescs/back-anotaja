import { Body, Controller, Post, Get, BadRequestException, Res, Query } from '@nestjs/common';
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

  @Public()
  @Get()
  signGet(@Query('request') request: string, @Res() res: Response) {
    if (!request) {
      throw new BadRequestException('Request parameter is required');
    }
    
    const signature = this.signService.sign(request);
    
    // QZ Tray espera texto puro, não JSON
    res.setHeader('Content-Type', 'text/plain');
    res.send(signature);
  }
}