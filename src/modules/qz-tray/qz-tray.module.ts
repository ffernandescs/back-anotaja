import { Module } from '@nestjs/common';
import { QZTrayController } from '../../controllers/qz-tray.controller';

@Module({
  controllers: [QZTrayController],
  exports: [],
})
export class QZTrayModule {}
