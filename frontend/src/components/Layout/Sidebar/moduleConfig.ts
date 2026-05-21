import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faShield,
  faGaugeHigh,
  faUsers,
  faKey,
  faTerminal,
  faScaleBalanced,
  faVault,
  faClockRotateLeft,
  faGear,
} from '@fortawesome/free-solid-svg-icons';

export interface ModuleSubSection {
  key: string;
  label: string;
  icon: IconDefinition;
  path: string;
  disabled?: boolean;
}

export interface ModuleConfig {
  name: string;
  icon: IconDefinition;
  basePath: string;
  sections: ModuleSubSection[];
}

export const MODULE_CONFIG: ModuleConfig = {
  name: 'ShellPilot',
  icon: faShield,
  basePath: '/dashboard',
  sections: [
    { key: 'dashboard', label: 'Dashboard', icon: faGaugeHigh, path: '/dashboard' },
    { key: 'users', label: 'Users', icon: faUsers, path: '/users' },
    { key: 'api-keys', label: 'API Keys', icon: faKey, path: '/api-keys' },
    { key: 'clis', label: 'CLIs Catalog', icon: faTerminal, path: '/clis' },
    { key: 'rules', label: 'Rules', icon: faScaleBalanced, path: '/rules' },
    { key: 'credentials', label: 'Credentials', icon: faVault, path: '/credentials' },
    { key: 'traces', label: 'Traces', icon: faClockRotateLeft, path: '/traces' },
    { key: 'settings', label: 'Settings', icon: faGear, path: '/settings' },
  ],
};
