import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { PrintConfigService } from '../services/print-configs.service';

interface RequestWithUser extends Request {
  user: {
    id: string;
    userId?: string;
    email?: string;
    role?: string;
    branchId?: string;
  };
}

@Controller('print-configs')
export class PrintConfigsController {
  constructor(private readonly printConfigService: PrintConfigService) {}

  @Get()
  async findAll(@Req() req: RequestWithUser) {
    
    const userId = req.user.userId || req.user.id;
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    return this.printConfigService.findAll(userId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.printConfigService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createPrintConfigDto: any, @Req() req: RequestWithUser) {
    console.log('PrintConfigsController.create - req.user.userId:', req.user.userId);
    
    const userId = req.user.userId || req.user.id;
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    return this.printConfigService.create(createPrintConfigDto, userId);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() updatePrintConfigDto: any) {
    return this.printConfigService.update(id, updatePrintConfigDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string) {
    return this.printConfigService.remove(id);
  }
}
