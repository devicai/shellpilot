import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faShield,
  faGaugeHigh,
  faUsers,
  faTerminal,
  faVault,
  faClockRotateLeft,
  faGear,
  faSitemap,
  faStore,
  faScroll,
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

// User/service-account-first IA: identities are the entry point; Policies are a
// first-class top-level section (the policy detail hosts the CLIs multiselect +
// the full rules table); API keys + credentials are managed per user.
export const MODULE_CONFIG: ModuleConfig = {
  name: 'ShellPilot',
  icon: faShield,
  basePath: '/dashboard',
  sections: [
    { key: 'dashboard', label: 'Dashboard', icon: faGaugeHigh, path: '/dashboard' },
    { key: 'users', label: 'Users & Service Accounts', icon: faUsers, path: '/users' },
    { key: 'profiles', label: 'Profiles', icon: faSitemap, path: '/profiles' },
    { key: 'policies', label: 'Policies', icon: faScroll, path: '/policies' },
    { key: 'clis', label: 'CLIs Catalog', icon: faTerminal, path: '/clis' },
    { key: 'catalog', label: 'Catalog Registry', icon: faStore, path: '/catalog' },
    { key: 'credentials', label: 'Credentials', icon: faVault, path: '/credentials' },
    { key: 'traces', label: 'Traces', icon: faClockRotateLeft, path: '/traces' },
    { key: 'settings', label: 'Settings', icon: faGear, path: '/settings' },
  ],
};
