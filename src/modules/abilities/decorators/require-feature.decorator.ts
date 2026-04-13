// decorators/require-feature.decorator.ts

import { SetMetadata } from '@nestjs/common';

export const REQUIRE_FEATURE = 'require_feature';

export const RequireFeature = (feature: string) =>
  SetMetadata(REQUIRE_FEATURE, feature);