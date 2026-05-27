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

// Rules and API Keys intentionally absent from the sidebar:
//   - Rules now live inside each CLI detail page (rules are always bound to a
//     CLI, so editing them separately was extra navigation for no benefit).
//   - API Keys collapsed to a single key per instance, managed from Settings.
export const MODULE_CONFIG: ModuleConfig = {
  name: 'ShellPilot',
  icon: faShield,
  basePath: '/dashboard',
  sections: [
    { key: 'dashboard', label: 'Dashboard', icon: faGaugeHigh, path: '/dashboard' },
    { key: 'users', label: 'Users', icon: faUsers, path: '/users' },
    { key: 'profiles', label: 'Profiles', icon: faSitemap, path: '/profiles' },
    { key: 'clis', label: 'CLIs Catalog', icon: faTerminal, path: '/clis' },
    { key: 'catalog', label: 'Catalog Registry', icon: faStore, path: '/catalog' },
    { key: 'credentials', label: 'Credentials', icon: faVault, path: '/credentials' },
    { key: 'traces', label: 'Traces', icon: faClockRotateLeft, path: '/traces' },
    { key: 'settings', label: 'Settings', icon: faGear, path: '/settings' },
  ],
};
