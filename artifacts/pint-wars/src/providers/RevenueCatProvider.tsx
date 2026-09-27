import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import Purchases, {
  type CustomerInfo,
  type PurchasesOffering,
} from 'react-native-purchases';
import { useAuth } from '@/src/providers/AuthProvider';

export const PINT_WAR_PRODUCTS = [
  { identifier: 'pint_war_6_players', capacity: 6 },
  { identifier: 'pint_war_10_players', capacity: 10 },
  { identifier: 'pint_war_14_players', capacity: 14 },
  { identifier: 'pint_war_16_players', capacity: 16 },
] as const;

export type PintWarProductIdentifier = (typeof PINT_WAR_PRODUCTS)[number]['identifier'];

const PINT_WAR_OFFERING_IDENTIFIER = 'default';

type RevenueCatStatus = 'loading' | 'signed-out' | 'ready' | 'error';

type RevenueCatContextValue = {
  status: RevenueCatStatus;
  isConfigured: boolean;
  error: string | null;
  offering: PurchasesOffering | null;
  customerInfo: CustomerInfo | null;
  refresh: () => Promise<void>;
};

const RevenueCatContext = createContext<RevenueCatContextValue | null>(null);

let configuredApiKey: string | null = null;
let activeAppUserId: string | null = null;

function getRevenueCatApiKey() {
  const isTestEnvironment =
    __DEV__ ||
    Platform.OS === 'web' ||
    Constants.executionEnvironment === 'storeClient';

  if (isTestEnvironment) {
    const testKey = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
    if (!testKey) {
      throw new Error('RevenueCat Test Store is not configured for this app.');
    }
    return testKey;
  }

  const platformKey =
    Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY
      : Platform.OS === 'android'
        ? process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY
        : null;

  if (!platformKey) {
    throw new Error('RevenueCat is missing this platform’s public SDK key.');
  }

  return platformKey;
}

async function syncRevenueCatIdentity(userId: string | null) {
  if (!userId) {
    if (configuredApiKey && activeAppUserId) {
      await Purchases.logOut();
      activeAppUserId = null;
    }
    return;
  }

  const apiKey = getRevenueCatApiKey();
  if (!configuredApiKey) {
    await Purchases.setLogLevel(
      __DEV__ ? Purchases.LOG_LEVEL.DEBUG : Purchases.LOG_LEVEL.WARN,
    );
    console.error('[RevenueCat] API key diagnostic', { exists: Boolean(apiKey), length: apiKey.length, prefix: apiKey.slice(0, 4) });
    Purchases.configure({ apiKey, appUserID: userId });
    configuredApiKey = apiKey;
    activeAppUserId = userId;
    return;
  }

  if (configuredApiKey !== apiKey) {
    throw new Error('RevenueCat was initialized with a different platform key.');
  }

  if (activeAppUserId !== userId) {
    await Purchases.logIn(userId);
    activeAppUserId = userId;
  }
}

export function RevenueCatProvider({ children }: React.PropsWithChildren) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [status, setStatus] = useState<RevenueCatStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    if (!configuredApiKey || !activeAppUserId) {
      throw new Error('Sign in before loading RevenueCat purchase data.');
    }

    const [nextCustomerInfo, offerings] = await Promise.all([
      Purchases.getCustomerInfo(),
      Purchases.getOfferings(),
    ]);
    setCustomerInfo(nextCustomerInfo);
    setOffering(offerings.all[PINT_WAR_OFFERING_IDENTIFIER] ?? null);
  }, []);

  useEffect(() => {
    if (isAuthLoading) return;

    const currentGeneration = ++generation.current;
    let customerInfoListener: ((info: CustomerInfo) => void) | undefined;
    let disposed = false;

    const isCurrent = () =>
      !disposed && generation.current === currentGeneration;

    async function initializeForSignedInUser() {
      if (!user) {
        setStatus('signed-out');
        setError(null);
        setOffering(null);
        setCustomerInfo(null);
        try {
          await syncRevenueCatIdentity(null);
        } catch {
          // Signing out must not prevent the app's Supabase session from ending.
        }
        return;
      }

      setStatus('loading');
      setError(null);

      try {
        await syncRevenueCatIdentity(user.id);
        if (!isCurrent()) return;

        customerInfoListener = (nextCustomerInfo) => {
          if (isCurrent()) setCustomerInfo(nextCustomerInfo);
        };
        Purchases.addCustomerInfoUpdateListener(customerInfoListener);
        await refresh();
        if (isCurrent()) setStatus('ready');
      } catch (cause) {
        if (!isCurrent()) return;
        setOffering(null);
        setCustomerInfo(null);
        setError(
          cause instanceof Error
            ? cause.message
            : 'RevenueCat could not be initialized.',
        );
        setStatus('error');
      }
    }

    void initializeForSignedInUser();

    return () => {
      disposed = true;
      if (customerInfoListener) {
        Purchases.removeCustomerInfoUpdateListener(customerInfoListener);
      }
    };
  }, [isAuthLoading, refresh, user?.id]);

  return (
    <RevenueCatContext.Provider
      value={{
        status,
        isConfigured: status === 'ready',
        error,
        offering,
        customerInfo,
        refresh,
      }}
    >
      {children}
    </RevenueCatContext.Provider>
  );
}

export function useRevenueCat() {
  const context = useContext(RevenueCatContext);
  if (!context) {
    throw new Error('useRevenueCat must be used inside RevenueCatProvider.');
  }
  return context;
}