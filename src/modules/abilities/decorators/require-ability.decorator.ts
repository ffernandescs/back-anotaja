// decorators/require-ability.decorator.ts

import { SetMetadata } from '@nestjs/common';

export const REQUIRE_ABILITY = 'require_ability';

export const RequireAbility = (feature: string, action: string) =>
  SetMetadata(REQUIRE_ABILITY, { feature, action });