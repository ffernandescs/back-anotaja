// interfaces/ability.interface.ts

export interface Ability {
  features: string[];
  actions: Record<string, string[]>; // feature -> actions
  limits: Record<string, number>; // featureKey -> maxValue
}