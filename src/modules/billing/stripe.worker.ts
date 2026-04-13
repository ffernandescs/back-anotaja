import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { StripeWebhookHandler } from './stripe-webhook.handler';

const connection = new Redis({
  host: '127.0.0.1',
  port: 6379,
});

const handler = new StripeWebhookHandler();

export const stripeWorker = new Worker(
  'stripe-events',
  async (job) => {
    await handler.handle(job.data.event);
  },
  { connection },
);