import type { NextAuthConfig, Session, DefaultSession } from 'next-auth';
import type { JWT } from 'next-auth/jwt';

import { authEnv } from '@/config/auth';

import { ssoProviders } from './sso-providers';
import { getAwsCredentials } from './aws';


export const initSSOProviders = () => {
  return authEnv.NEXT_PUBLIC_ENABLE_NEXT_AUTH
    ? authEnv.NEXT_AUTH_SSO_PROVIDERS.split(/[,，]/).map((provider) => {
        const validProvider = ssoProviders.find((item) => item.id === provider.trim());

        if (validProvider) return validProvider.provider;

        throw new Error(`[NextAuth] provider ${provider} is not supported`);
      })
    : [];
};

interface AWSCredentials {
  accessKeyId: string;
  expiration: string;
  secretAccessKey: string;
  sessionToken: string;
}

interface ExtendedSession extends Session {
  awsCredentials?: AWSCredentials | null;
  token?: string;
  user: {
    id: string;
    token?: string;
  } & DefaultSession['user'];
}

interface ExtendedJWT extends JWT {
  accessToken?: string;
  userId?: string;
}

// Notice this is only an object, not a full Auth.js instance
export default {
  callbacks: {
    // Note: Data processing order of callback: authorize --> jwt --> session
    async jwt({ token, account, user }) {
      // ref: https://authjs.dev/guides/extending-the-session#with-jwt
      if (user?.id) {
        token.userId = user?.id;
      }
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }
      return token as ExtendedJWT;
    },
    async session({ session, token, user }): Promise<ExtendedSession> {
      if (session.user) {
        // ref: https://authjs.dev/guides/extending-the-session#with-database
        if (user) {
          session.user.id = user.id;
        } else {
          session.user.id = (token.userId ?? session.user.id) as string;
        }
      }

      if ((token as ExtendedJWT).accessToken) {
        const accessToken = (token as ExtendedJWT).accessToken;
        session.token = accessToken;
        session.user.token = accessToken;
        
        try {
          const awsCredentials = await getAwsCredentials(accessToken);
          session.awsCredentials = {
            accessKeyId: awsCredentials.accessKeyId,
            expiration: awsCredentials.expiration,
            secretAccessKey: awsCredentials.secretAccessKey,
            sessionToken: awsCredentials.sessionToken,
          };
        } catch (error) {
          console.error('Error fetching AWS credentials:', error);
          session.awsCredentials = null;
        }
      }

      return session;
    },
  },
  debug: authEnv.NEXT_AUTH_DEBUG,
  providers: initSSOProviders(),
  secret: authEnv.NEXT_AUTH_SECRET,
  trustHost: process.env?.AUTH_TRUST_HOST ? process.env.AUTH_TRUST_HOST === 'true' : true,
} satisfies NextAuthConfig;
