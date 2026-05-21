import { theme as antdTheme, ThemeConfig } from 'antd';

export const THEME_TOKENS = {
  colorPrimary: '#4661B1',
  colorInfo: '#4661B1',
  colorText: '#b3b3b3',
  borderRadius: 6,
};

export const shellpilotTheme: ThemeConfig = {
  algorithm: antdTheme.darkAlgorithm,
  token: THEME_TOKENS,
  components: {
    Card: { bodyPadding: 10 },
    Button: {
      colorPrimaryBorderHover: THEME_TOKENS.colorPrimary,
      defaultHoverBorderColor: THEME_TOKENS.colorPrimary,
    },
  },
};
