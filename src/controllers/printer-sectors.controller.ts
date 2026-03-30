import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { PrinterSectorService } from '../services/printer-sectors.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email?: string;
    role?: string;
  };
}

@Controller('printer-sectors')
@UseGuards(JwtAuthGuard)
export class PrinterSectorsController {
  constructor(private readonly printerSectorsService: PrinterSectorService) {}

  @Get()
  async findAll(@Req() req: RequestWithUser) {
    return this.printerSectorsService.findAll(req.user.userId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.printerSectorsService.findOne(id);
  }

  @Post()
  async create(@Body() createSectorDto: any, @Req() req: RequestWithUser) {
    return this.printerSectorsService.create(createSectorDto, req.user.userId);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() updateSectorDto: any, @Req() req: RequestWithUser) {
    return this.printerSectorsService.update(id, updateSectorDto, req.user.userId);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.printerSectorsService.remove(id);
  }
}
