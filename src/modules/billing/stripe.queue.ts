import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

const connection = new Redis({
  host: '127.0.0.1',
  port: 6379,
});

export const stripeQueue = new Queue('stripe-events', {
  connection,
});