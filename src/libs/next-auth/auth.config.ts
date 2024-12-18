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
    async jwt({ token, user, account }) {
      console.log('JWT Callback - User:', user); // Basic user info
      console.log('JWT Callback - Account:', account); // Provider tokens and data

      if (user?.id) {
        token.userId = user.id;
      }
      if (account?.access_token) {
        token.access_token = account.access_token;
      }
      if (account?.id_token) {
        token.id_token = account.id_token;
      }
      return token;
    },
    async session({ session, token, user }) {
      if (session.user) {
        if (user) {
          session.user.id = user.id;
        } else {
          session.user.id = (token.userId ?? session.user.id) as string;
        }
        session.user.jwt = token.id_token as string | undefined;

        // if (session.user.jwt) {
        //   try {
        //     const region = process.env.AWS_REGION || 'us-east-1';
        //     const userPoolId = process.env.AWS_USER_POOL_ID || '';
        //     const cognitoIssuer = `cognito-idp.${region}.amazonaws.com/${userPoolId}`;
        //     const credentials = await fromCognitoIdentityPool({
        //       clientConfig: { region },
        //       identityPoolId: process.env.AWS_IDENTITY_POOL_ID || '',
        //       logins: {
        //         [cognitoIssuer]: session.user.jwt,
        //       },
        //     })();
        //     session.user.accessKeyId = credentials.accessKeyId;
        //     session.user.secretAccessKey = credentials.secretAccessKey;
        //     session.user.sessionToken = credentials.sessionToken;
        //   } catch (error) {
        //     // Set empty values in case of error
        //     session.user.accessKeyId = undefined;
        //     session.user.secretAccessKey = undefined;
        //     session.user.sessionToken = undefined;
        //     console.error('Error getting AWS credentials:', error);
        //   }
        // }
      }
      return session;
    },
  },
  debug: authEnv.NEXT_AUTH_DEBUG,
  providers: initSSOProviders(),
  secret: authEnv.NEXT_AUTH_SECRET,
  trustHost: process.env?.AUTH_TRUST_HOST ? process.env.AUTH_TRUST_HOST === 'true' : true,
} satisfies NextAuthConfig;
