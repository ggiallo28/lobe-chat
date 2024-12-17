import { CognitoIdentityClient } from '@aws-sdk/client-cognito-identity';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-provider-cognito-identity';
import type { NextAuthConfig } from 'next-auth';

import { authEnv } from '@/config/auth';

import { ssoProviders } from './sso-providers';

export const initSSOProviders = () => {
  return authEnv.NEXT_PUBLIC_ENABLE_NEXT_AUTH
    ? authEnv.NEXT_AUTH_SSO_PROVIDERS.split(/[,，]/).map((provider) => {
        const validProvider = ssoProviders.find((item) => item.id === provider.trim());

        if (validProvider) return validProvider.provider;

        throw new Error(`[NextAuth] provider ${provider} is not supported`);
      })
    : [];
};

// Notice this is only an object, not a full Auth.js instance
export default {
  callbacks: {
    // Note: Data processing order of callback: authorize --> jwt --> session
    async jwt({ token, account }) {
      if (account?.userId) {
        token.userId = account.userId;
      }
      if (account?.access_token) {
        token.access_token = account.access_token;
      }
      if (account?.id_token) {
        token.id_token = account.id_token; // Store Cognito ID token
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
        session.user.jwt = token.access_token as string | undefined; // Use access_token instead of id_token

        if (session.user.jwt) {
          try {
            const cognitoIdentityClient = new CognitoIdentityClient({
              region: process.env.AWS_REGION || 'us-east-1',
            });
            const credentials = await fromCognitoIdentityPool({
              client: cognitoIdentityClient,
              clientConfig: { region: process.env.AWS_REGION || 'us-east-1' },
              identityPoolId: process.env.AWS_IDENTITY_POOL_ID || '',
              logins: {
                [`"cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${process.env.AWS_USER_POOL_ID}"`]:
                  token.id_token as string, // Use id_token for Cognito authentication
              },
            })();
            // src/types/next-auth.d.ts
            session.user.accessKeyId = credentials.accessKeyId;
            session.user.secretAccessKey = credentials.secretAccessKey;
            session.user.sessionToken = credentials.sessionToken;
          } catch (error) {
            // Set empty values in case of error
            session.user.accessKeyId = undefined;
            session.user.secretAccessKey = undefined;
            session.user.sessionToken = undefined;
            console.error('Error getting AWS credentials:', error);
          }
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
