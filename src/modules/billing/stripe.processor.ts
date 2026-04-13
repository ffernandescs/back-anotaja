import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';

@Processor('stripe-events')
export class StripeProcessor extends WorkerHost {
  private readonly logger = new Logger(StripeProcessor.name);

  async process(job: Job<any>) {
    this.logger.log(`🔥 Processando job: ${job.name}`);

    const { event } = job.data;

    this.logger.log(`Evento Stripe: ${event.type}`);

    // 👉 IMPORTANTE:
    // move pra cá toda lógica que estava no webhook
  }
}