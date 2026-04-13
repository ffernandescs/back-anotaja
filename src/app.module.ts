import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { CashRegisterFilter } from './common/filters/cash-register.filter';
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
import { CashSessionModule } from './modules/cash-register/cash-session.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { BillingModule } from './modules/billing/billing.module';
import { GeocodingModule } from './modules/geocoding/geocoding.module';
import { DeliveryAreasModule } from './modules/delivery-areas/delivery-areas.module';
import { DeliveryAssignmentsModule } from './modules/delivery-assignments/delivery-assignments.module';
import { AutoRouteConfigModule } from './modules/auto-route-config/auto-route-config.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { CouponsModule } from './modules/coupons/coupons.module';
import { UploadModule } from './modules/upload/upload.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { CronModule } from './modules/cron/cron.module';
import { StockModule } from './stock/stock.module';
import { IngredientsModule } from './ingredients/ingredients.module';
import { IngredientCategoriesModule } from './ingredient-categories/ingredient-categories.module';
import { OwnerModule } from './modules/owner/owner.module';
import { FeaturesModule } from './modules/features/features.module';
import { AddonsModule } from './modules/addons/addons.module';
import { LimitsModule } from './modules/limits/limits.module';
import { MenuGroupsModule } from './modules/menu-groups/menu-groups.module';
import { MasterModule } from './modules/master/master.module';
import { PrinterModule } from './modules/printer/printer.module';
import { PrinterSectorsModule } from './modules/printer-sectors/printer-sectors.module';
import { PrintConfigsModule } from './modules/print-configs/print-configs.module';
import { SignModule } from './modules/sign/sign.module';
import { QZTrayModule } from './modules/qz-tray/qz-tray.module';
import { GeneralConfigModule } from './modules/general-config/general-config.module';
import { PerformanceModule } from './modules/performance/performance.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    BullModule.forRoot({
      connection: {
        host: '127.0.0.1',
        port: 6379,
      },
    }),
    AuthModule,
    UsersModule,
    BranchesModule,
    CashSessionModule,
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
    BillingModule,
    GeocodingModule,
    DeliveryAreasModule,
    DeliveryAssignmentsModule,
    AutoRouteConfigModule,
    DeliveryModule,
    CouponsModule,
    UploadModule,
    OnboardingModule,
    CronModule,
    StockModule,
    IngredientsModule,
    IngredientCategoriesModule,
    OwnerModule,
    FeaturesModule,
    AddonsModule,
    LimitsModule,
    MenuGroupsModule,
    MasterModule,
    PrinterModule,
    PrinterSectorsModule,
    PrintConfigsModule,
    SignModule,
    QZTrayModule,
    GeneralConfigModule,
    PerformanceModule,
    AnalyticsModule,
    IntegrationsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_FILTER,
      useClass: CashRegisterFilter,
    },
  ],
})
export class AppModule {}
