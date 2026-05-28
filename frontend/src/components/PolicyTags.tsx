import { Tag, Tooltip } from 'antd';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBan,
  faCircleCheck,
  faCircleXmark,
  faEye,
  faHourglassHalf,
  faKey,
  faShieldHalved,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import type { Decision, Enforcement } from '../types/api';

type TagMeta = { color: string; icon: IconDefinition; tip: string };

const ENFORCEMENT_META: Record<Enforcement, TagMeta> = {
  enforce: {
    color: 'red',
    icon: faShieldHalved,
    tip: 'Enforce — rule decisions are applied. Commands marked deny are blocked before reaching the real CLI.',
  },
  warn: {
    color: 'gold',
    icon: faTriangleExclamation,
    tip: 'Warn — rule decisions are evaluated and surfaced to the user, but the command is allowed to run.',
  },
  audit: {
    color: 'default',
    icon: faEye,
    tip: 'Audit — rules are evaluated for logging only. Nothing is blocked or surfaced to the user.',
  },
};

// Widened to `string` to accept the runtime/operational decisions the wrapper
// emits in traces beyond pure policy decisions (e.g. `jit-issued` when the
// wrapper injected a short-lived credential; `binary-missing` when the shim
// found no real binary). The TS-narrow `Decision` keys are still required at
// compile time via DecisionTag's prop.
const DECISION_META: Record<string, TagMeta> = {
  allow: {
    color: 'green',
    icon: faCircleCheck,
    tip: 'Allow — the command is permitted to run as invoked by the agent.',
  },
  deny: {
    color: 'red',
    icon: faBan,
    tip: 'Deny — the command is blocked. The agent receives a non-zero exit and the rule reason.',
  },
  'requires-approval': {
    color: 'gold',
    icon: faHourglassHalf,
    tip: 'Requires approval — execution is paused until an operator approves the command out-of-band.',
  },
  'jit-issued': {
    color: 'blue',
    icon: faKey,
    tip: 'JIT credential issued — the wrapper injected a short-lived credential for this invocation.',
  },
};

const FALLBACK: TagMeta = { color: 'default', icon: faCircleXmark, tip: '' };

function renderTag(meta: TagMeta, label: string) {
  return (
    <Tooltip title={meta.tip}>
      <Tag color={meta.color} style={{ cursor: 'help' }}>
        <FontAwesomeIcon icon={meta.icon} style={{ marginRight: 6 }} />
        {label}
      </Tag>
    </Tooltip>
  );
}

export function EnforcementTag({ value }: { value: Enforcement }) {
  return renderTag(ENFORCEMENT_META[value] ?? FALLBACK, value);
}

export function DecisionTag({ value }: { value: Decision }) {
  return renderTag(DECISION_META[value] ?? FALLBACK, value);
}
