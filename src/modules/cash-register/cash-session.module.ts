import { Module, forwardRef } from '@nestjs/common';
import { CashSessionController } from './cash-session.controller';
import { CashSessionService } from './cash-session.service';
// Reutiliza o Gateway já existente — NÃO cria um segundo WebSocketGateway
import { WebSocketModule } from '../websocket/websocket.module'; // ajuste o path se necessário

@Module({
  imports: [
    forwardRef(() => WebSocketModule), // forwardRef evita dependência circular
  ],
  controllers: [CashSessionController],
  providers: [CashSessionService],
})
export class CashSessionModule {}