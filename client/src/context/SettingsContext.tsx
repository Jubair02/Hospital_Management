import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getSystemSettings } from '../services/adminService';
import useAuth from '../hooks/useAuth';
import { HOSPITAL_NAME } from '../utils/constants';
import { setActiveCurrency } from '../utils/money';
import type { SystemSettings } from '../types';

export interface SettingsContextValue {
  settings: SystemSettings | null;
  /** Hospital name from settings, falling back to the build-time default. */
  hospitalName: string;
  currency: string;
  appointmentSlotMinutes: number;
  refresh: () => void;
}

export const SettingsContext = createContext<SettingsContextValue | null>(null);

/**
 * Loads editable system settings once per session so the shell, booking
 * flow, and money formatting read them from the database instead of
 * hard-coded constants. Falls back to the build-time defaults if the
 * request fails, so a settings outage never blanks the UI.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [settings, setSettings] = useState<SystemSettings | null>(null);

  const refresh = useCallback(() => {
    if (!isAuthenticated) {
      setSettings(null);
      return;
    }
    getSystemSettings()
      .then((loaded) => {
        setSettings(loaded);
        setActiveCurrency(loaded.currency);
      })
      .catch(() => {
        /* keep the defaults below */
      });
  }, [isAuthenticated]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      hospitalName: settings?.hospitalName ?? HOSPITAL_NAME,
      currency: settings?.currency ?? 'USD',
      appointmentSlotMinutes: settings?.appointmentSlotMinutes ?? 30,
      refresh,
    }),
    [settings, refresh]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
