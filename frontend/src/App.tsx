import React from 'react';
import { ConfigProvider, App as AntApp } from 'antd';
import { RouterProvider } from 'react-router-dom';
import { shellpilotTheme, THEME_TOKENS } from './theme/antd-theme';
import { AuthProvider } from './context/AuthContext';
import { router } from './router';

const App: React.FC = () => {
  const isDark = true;

  return (
    <ConfigProvider theme={shellpilotTheme}>
      <AntApp>
        <div
          data-theme={isDark ? 'dark' : 'light'}
          style={
            {
              '--theme-primary-color': THEME_TOKENS.colorPrimary,
              '--theme-info-color': THEME_TOKENS.colorInfo,
              '--theme-text-color': THEME_TOKENS.colorText,
              '--theme-info-shadow': 'rgba(70, 97, 177, 0.2)',
              height: '100%',
            } as React.CSSProperties
          }
        >
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </div>
      </AntApp>
    </ConfigProvider>
  );
};

export default App;
