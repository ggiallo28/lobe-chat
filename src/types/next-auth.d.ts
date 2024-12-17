import { type DefaultSession } from 'next-auth';

declare module 'next-auth' {
  /**
   * Returned by `useSession`, `auth`, contains information about the active session.
   */
  interface Session {
    user: {
      accessKeyId?: string;
      firstName?: string;
      id: string;
      jwt?: string;
      secretAccessKey?: string;
      sessionToken?: string;
    } & DefaultSession['user'];
  }
  interface User {
    providerAccountId?: string;
  }
  /**
   * More types can be extends here
   * ref: https://authjs.dev/getting-started/typescript
   */
}

declare module '@auth/core/jwt' {
  /** Returned by the `jwt` callback and `auth`, when using JWT sessions */
  interface JWT {
    access_token?: string;
    id_token?: string; // For storing Cognito ID token
    userId: string;
  }
}
