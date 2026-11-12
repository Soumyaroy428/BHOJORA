import { DIETARY_LABELS, type DietaryType } from '@bhojora/shared';

interface DietaryBadgeProps {
  dietaryType: DietaryType;
}

export function DietaryBadge({ dietaryType }: DietaryBadgeProps) {
  const variantClass =
    dietaryType === 'PURE_VEG'
      ? 'dietary-badge dietary-veg'
      : dietaryType === 'EGG'
        ? 'dietary-badge dietary-egg'
        : 'dietary-badge dietary-nonveg';

  return (
    <span className={variantClass}>
      <span className="dietary-box" aria-hidden="true">
        {dietaryType === 'NON_VEG' ? '▲' : '●'}
      </span>
      <span>{DIETARY_LABELS[dietaryType]}</span>
    </span>
  );
}
