import { UpdateSubscriptionDto } from './dto/update-subscription.dto';

export type UpdateSubscriptionInput = Omit<
  UpdateSubscriptionDto,
  'startDate' | 'endDate' | 'nextBillingDate' | 'lastBillingDate'
> & {
  startDate?: Date;
  endDate?: Date;
  nextBillingDate?: Date;
  lastBillingDate?: Date;
};
