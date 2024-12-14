import type { OIDCConfig } from '@auth/core/providers';
import { CognitoIdentityClient } from '@aws-sdk/client-cognito-identity';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-provider-cognito-identity';

import { authEnv } from '@/config/auth';
import { CommonProviderConfig } from './sso.config';

export type CognitoOIDCProfile = {
  email: string;
  sub: string;
  name?: string;
  picture?: string;
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
  secretAccessKey: string;
  sessionToken: string;
  expiration: Date;
}> => {
  const cognitoIdentityClient = new CognitoIdentityClient({ region: 'us-east-1' });

  const credentialsProvider = fromCognitoIdentityPool({
    client: cognitoIdentityClient,
    identityPoolId,
    logins: {
      [`cognito-idp.us-east-1.amazonaws.com/${userPoolId}`]: jwtIdToken,
    },
  });

  const credentials = await credentialsProvider();

  return {
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    sessionToken: credentials.sessionToken,
    expiration: credentials.expiration,
  };
};

/**
 * Creates a Cognito OIDC provider configuration for NextAuth.js.
 * @param options - Cognito-specific options for user pool and identity pool.
 * @returns A configured OIDC provider.
 */
const createCognitoProvider = ({ identityPoolId, userPoolId }: CognitoProviderOptions) => ({
  id: 'cognito',
  provider: {
    ...CommonProviderConfig,
    authorization: { params: { scope: 'openid email profile' } }, // Default OIDC scopes
    checks: ['state', 'pkce'], // Recommended for OIDC
    clientId: authEnv.GENERIC_OIDC_CLIENT_ID ?? process.env.AUTH_GENERIC_OIDC_ID,
    clientSecret: authEnv.GENERIC_OIDC_CLIENT_SECRET ?? process.env.AUTH_GENERIC_OIDC_SECRET,
    issuer: authEnv.GENERIC_OIDC_ISSUER ?? process.env.AUTH_GENERIC_OIDC_ISSUER,
    id: 'cognito',
    name: 'Cognito OIDC',
    profile: async (profile, tokens) => {
      const { access_token } = tokens; // Cognito access token
      let awsCredentials = null;

      try {
        // Fetch AWS credentials using the Cognito access token
        awsCredentials = await getAwsCredentials(access_token!, { identityPoolId, userPoolId });
      } catch (error) {
        console.error('Error fetching AWS credentials:', error);
      }

      return {
        email: profile.email,
        id: profile.sub,
        image: profile.picture,
        name: profile.name ?? profile.username ?? profile.email,
        providerAccountId: profile.sub,
        awsCredentials: awsCredentials
          ? {
              accessKeyId: awsCredentials.accessKeyId,
              secretAccessKey: awsCredentials.secretAccessKey,
              sessionToken: awsCredentials.sessionToken,
              expiration: awsCredentials.expiration,
            }
          : null,
      };
    },
    type: 'oidc',
  } satisfies OIDCConfig<CognitoOIDCProfile>,
});

export default createCognitoProvider;