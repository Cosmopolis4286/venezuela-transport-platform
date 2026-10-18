import { useColorScheme } from 'react-native';

/** Same neutral palette as the web portal (shadcn "neutral"). */
const light = {
  background: '#ffffff',
  card: '#ffffff',
  text: '#0a0a0a',
  muted: '#737373',
  surface: '#f5f5f5',
  border: '#e5e5e5',
  primary: '#171717',
  primaryText: '#fafafa',
  danger: '#dc2626',
  dangerSurface: '#fef2f2',
  success: '#15803d',
  successSurface: '#f0fdf4',
  warning: '#b45309',
  warningSurface: '#fffbeb',
};

export type Palette = typeof light;

const dark: Palette = {
  background: '#0a0a0a',
  card: '#171717',
  text: '#fafafa',
  muted: '#a3a3a3',
  surface: '#262626',
  border: '#2e2e2e',
  primary: '#e5e5e5',
  primaryText: '#171717',
  danger: '#f87171',
  dangerSurface: '#2a1212',
  success: '#4ade80',
  successSurface: '#0f2416',
  warning: '#fbbf24',
  warningSurface: '#2a1f0a',
};

export function useColors(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = 10;
