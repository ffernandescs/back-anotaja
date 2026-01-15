import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { BranchesModule } from './modules/branches/branches.module';
import { SubscriptionModule } from './modules/subscription/subscription.module';
import { PlansModule } from './modules/plans/plans.module';
import { OrdersModule } from './modules/orders/orders.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { ProductsModule } from './modules/products/products.module';
import { DeliveryPersonsModule } from './modules/delivery-persons/delivery-persons.module';
import { ComplementsModule } from './modules/complements/complements.module';
import { ComplementOptionsModule } from './modules/complement-options/complement-options.module';
import { AiModule } from './modules/ai/ai.module';
import { OrderItemsModule } from './modules/order-items/order-items.module';
import { WebSocketModule } from './modules/websocket/websocket.module';
import { StoreModule } from './modules/store/store.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { TablesModule } from './modules/tables/tables.module';
import { CustomersModule } from './modules/customers/customers.module';
import { PaymentMethodsModule } from './modules/payment-methods/payment-methods.module';
import { BillsplitsModule } from './modules/billsplits/billsplits.module';
import { CashRegisterModule } from './modules/cash-register/cash-register.module';
import { CompaniesModule } from './modules/companies/companies.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    AuthModule,
    UsersModule,
    BranchesModule,
    SubscriptionModule,
    PlansModule,
    OrdersModule,
    CategoriesModule,
    ProductsModule,
    DeliveryPersonsModule,
    ComplementsModule,
    ComplementOptionsModule,
    AiModule,
    OrderItemsModule,
    WebSocketModule,
    StoreModule,
    NotificationsModule,
    TablesModule,
    CustomersModule,
    PaymentMethodsModule,
    BillsplitsModule,
    CashRegisterModule,
    CompaniesModule,
    // Adicionar outros módulos conforme necessário
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
