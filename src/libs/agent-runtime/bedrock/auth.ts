import { CognitoIdentityClient } from '@aws-sdk/client-cognito-identity';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-provider-cognito-identity';

/**
 * Get temporary AWS credentials from Cognito Identity Pool
 */
export const getCognitoCredentials = (userIdToken: string, userPoolId: string, identityPoolId: string, region: string) => {
  const cognitoIdentityClient = new CognitoIdentityClient({ region });

  return fromCognitoIdentityPool({
    client: cognitoIdentityClient,
    identityPoolId,
    logins: {
      // Format: cognito-idp.[REGION].amazonaws.com/[USER_POOL_ID]
      [`cognito-idp.${region}.amazonaws.com/${userPoolId}`]: userIdToken,
    },
  });
};

/**
 * Get Cognito session details from NextAuth session
 */
export const getCognitoSessionDetails = (session: any) => {
  if (!session?.user?.jwt) {
    throw new Error('No JWT found in session');
  }

  const userPoolId = process.env.AWS_USER_POOL_ID;
  const identityPoolId = process.env.AWS_IDENTITY_POOL_ID;

  if (!userPoolId || !identityPoolId) {
    throw new Error('AWS Cognito configuration missing. Please set AWS_USER_POOL_ID and AWS_IDENTITY_POOL_ID');
  }

  return {
    identityPoolId,
    userIdToken: session.user.jwt,
    userPoolId,
  };
};
