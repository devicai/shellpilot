import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import AppLayout from './components/Layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { CliLoginPage } from './pages/auth/CliLogin';
import { DashboardPage } from './pages/DashboardPage';
import { UsersListPage } from './pages/users/UsersList';
import { UserDetailPage } from './pages/users/UserDetail';
import { ClisListPage } from './pages/clis/ClisList';
import { CatalogRegistryPage } from './pages/clis/CatalogRegistry';
import { CliDetailPage } from './pages/clis/CliDetail';
import { CredentialsListPage } from './pages/credentials/CredentialsList';
import { TracesListPage } from './pages/traces/TracesList';
import { SettingsPage } from './pages/settings/SettingsPage';
import { ProfilesListPage } from './pages/profiles/ProfilesList';
import { PoliciesListPage } from './pages/policies/PoliciesList';
import { PolicyDetailPage } from './pages/policies/PolicyDetail';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/cli-login', element: <CliLoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <Navigate to="/dashboard" replace /> },
          { path: '/dashboard', element: <DashboardPage /> },
          { path: '/users', element: <UsersListPage /> },
          { path: '/users/:id', element: <UserDetailPage /> },
          { path: '/policies', element: <PoliciesListPage /> },
          { path: '/policies/:id', element: <PolicyDetailPage /> },
          { path: '/clis', element: <ClisListPage /> },
          { path: '/catalog', element: <CatalogRegistryPage /> },
          { path: '/clis/:slug', element: <CliDetailPage /> },
          { path: '/credentials', element: <CredentialsListPage /> },
          { path: '/profiles', element: <ProfilesListPage /> },
          { path: '/traces', element: <TracesListPage /> },
          { path: '/settings', element: <SettingsPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/dashboard" replace /> },
]);
