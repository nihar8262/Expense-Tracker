import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.expensetracker.app',
  appName: 'Expense Tracker',
  webDir: 'dist',
  plugins: {
    CapacitorHttp: {
      enabled: true
    },
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ['google.com', 'github.com', 'facebook.com']
    }
  }
};

export default config;
