import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import AppLayout from './components/Layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { UsersListPage } from './pages/users/UsersList';
import { ClisListPage } from './pages/clis/ClisList';
import { CliDetailPage } from './pages/clis/CliDetail';
import { CredentialsListPage } from './pages/credentials/CredentialsList';
import { TracesListPage } from './pages/traces/TracesList';
import { SettingsPage } from './pages/settings/SettingsPage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <Navigate to="/dashboard" replace /> },
          { path: '/dashboard', element: <DashboardPage /> },
          { path: '/users', element: <UsersListPage /> },
          { path: '/clis', element: <ClisListPage /> },
          { path: '/clis/:slug', element: <CliDetailPage /> },
          { path: '/credentials', element: <CredentialsListPage /> },
          { path: '/traces', element: <TracesListPage /> },
          { path: '/settings', element: <SettingsPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/dashboard" replace /> },
]);
