import CognitoProvider from 'next-auth/providers/cognito';

import { authEnv } from '@/config/auth';

import { CommonProviderConfig } from './sso.config';

const provider = {
  id: 'cognito',
  provider: CognitoProvider({
    clientId: authEnv.COGNITO_CLIENT_ID ?? process.env.COGNITO_CLIENT_ID,
    clientSecret: authEnv.COGNITO_CLIENT_SECRET ?? process.env.COGNITO_CLIENT_SECRET,
    issuer: authEnv.COGNITO_ISSUER ?? process.env.COGNITO_ISSUER,
    ...CommonProviderConfig,
    authorization: {
      params: {
        response_type: 'code',
        scope: 'openid email profile',
      },
    },
    profile(profile) {
      return {
        email: profile.email,
        id: profile.sub,
        image: profile.picture,
        name: profile.name,
      };
    },
  }),
};

export default provider;
