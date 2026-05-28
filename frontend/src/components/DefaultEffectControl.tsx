import { Tooltip } from 'antd';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBan, faCircleCheck, faHand } from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import type { Decision } from '../types/api';

// Three-state segmented control for a policy's default effect (allow / ask /
// deny). Same widget everywhere defaultEffect is editable — PolicyDetail and
// the individual-rules block on UserDetail — so the operator's mental model
// is the same regardless of where they're sitting.
//
// Icon mapping: check = allow, hand = requires-approval (ask), ban = deny.

type Spec = { value: Decision; icon: IconDefinition; label: string; tip: string };

const SPECS: Spec[] = [
  {
    value: 'allow',
    icon: faCircleCheck,
    label: 'Allow',
    tip: 'Allow by default — commands run unless an explicit deny rule matches.',
  },
  {
    value: 'requires-approval',
    icon: faHand,
    label: 'Ask',
    tip: 'Ask by default — every command pauses until an operator approves, unless a rule overrides.',
  },
  {
    value: 'deny',
    icon: faBan,
    label: 'Deny',
    tip: 'Deny by default — nothing runs unless an explicit allow rule matches (default-closed).',
  },
];

export interface DefaultEffectControlProps {
  value?: Decision;
  onChange?: (next: Decision) => void;
  disabled?: boolean;
  size?: 'small' | 'middle' | 'large';
}

// AntD's <Segmented> doesn't give us per-segment tooltips on its icon-only
// option shape, and we want a heavy-handed visual (filled circle around the
// selected icon, like the screenshot the user shared). Rolling our own keeps
// the markup small and the styling predictable.
export function DefaultEffectControl({
  value,
  onChange,
  disabled,
  size = 'middle',
}: DefaultEffectControlProps) {
  const px = size === 'small' ? 28 : size === 'large' ? 40 : 34;
  const icon = size === 'small' ? 12 : size === 'large' ? 18 : 14;
  return (
    <div
      role="radiogroup"
      style={{
        display: 'inline-flex',
        padding: 4,
        gap: 4,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 999,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {SPECS.map((s) => {
        const selected = s.value === value;
        return (
          <Tooltip key={s.value} title={s.tip}>
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={s.label}
              disabled={disabled}
              onClick={() => onChange?.(s.value)}
              style={{
                width: px,
                height: px,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                border: 'none',
                cursor: disabled ? 'not-allowed' : 'pointer',
                background: selected ? 'rgba(255,255,255,0.14)' : 'transparent',
                color: selected ? '#fff' : 'rgba(255,255,255,0.55)',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              <FontAwesomeIcon icon={s.icon} style={{ fontSize: icon }} />
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
