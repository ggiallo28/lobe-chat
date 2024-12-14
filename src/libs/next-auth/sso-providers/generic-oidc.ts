import type { OIDCConfig } from '@auth/core/providers';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-provider-cognito-identity';

import { authEnv } from '@/config/auth';

import { CommonProviderConfig } from './sso.config';

export type AwsCredentials = {
  accessKeyId: string;
  expiration: string;
  secretAccessKey: string;
  sessionToken: string;
};

export type GenericOIDCProfile = {
  awsCredentials?: AwsCredentials;
  email: string;
  id?: string;
  name?: string;
  picture?: string;
  sub: string;
  username?: string;
};

export type CognitoProviderOptions = {
  identityPoolId: string;
  userPoolId: string;
};

/**
 * Fetch AWS credentials using Cognito access token.
 * @param jwtIdToken - Cognito access token (JWT).
 * @param options - Configuration options for identity pool and user pool.
 * @returns AWS credentials object.
 */
const getAwsCredentials = async (
  jwtIdToken: string,
  { identityPoolId, userPoolId }: CognitoProviderOptions
): Promise<{
  accessKeyId: string;
  expiration: Date;
  secretAccessKey: string;
  sessionToken: string;
}> => {
  const credentialsProvider = fromCognitoIdentityPool({
    identityPoolId,
    logins: {
      [`cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${userPoolId}`]: jwtIdToken,
    },
  });

  const credentials = await credentialsProvider();

  return {
    accessKeyId: credentials.accessKeyId,
    expiration: credentials.expiration,
    secretAccessKey: credentials.secretAccessKey,
    sessionToken: credentials.sessionToken,
  };
};

const provider = {
  id: 'generic-oidc',
  provider: {
    ...CommonProviderConfig,
    authorization: { params: { scope: 'email openid profile' } },
    checks: ['state', 'pkce'],
    clientId: authEnv.GENERIC_OIDC_CLIENT_ID ?? process.env.AUTH_GENERIC_OIDC_ID,
    clientSecret: authEnv.GENERIC_OIDC_CLIENT_SECRET ?? process.env.AUTH_GENERIC_OIDC_SECRET,
    id: 'generic-oidc',
    issuer: authEnv.GENERIC_OIDC_ISSUER ?? process.env.AUTH_GENERIC_OIDC_ISSUER,
    name: 'Generic OIDC',
    profile: async (profile, tokens) => {
      const { access_token } = tokens; // Cognito access token
      let awsCredentials = null;

      const identityPoolId = process.env.AWS_IDENTITY_POOL_ID
      const userPoolId = process.env.AWS_USER_POOL_ID

      try {
        // Fetch AWS credentials using the Cognito access token
        awsCredentials = await getAwsCredentials(access_token!, { identityPoolId, userPoolId });
      } catch (error) {
        console.error('Error fetching AWS credentials:', error);
      }

      return {
        awsCredentials: awsCredentials
          ? {
              accessKeyId: awsCredentials.accessKeyId,
              expiration: awsCredentials.expiration,
              secretAccessKey: awsCredentials.secretAccessKey,
              sessionToken: awsCredentials.sessionToken,
            }
          : null,
        email: profile.email,
        id: profile.sub,
        image: profile.picture,
        name: profile.name ?? profile.username ?? profile.email,
        providerAccountId: profile.sub,
      };
    },
    type: 'oidc',
  } satisfies OIDCConfig<GenericOIDCProfile>,
};

export default provider;
