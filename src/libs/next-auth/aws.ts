import { CognitoIdentityClient } from '@aws-sdk/client-cognito-identity';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-provider-cognito-identity';

/**
 * Retrieves AWS credentials using the Cognito Identity Pool and JWT token.
 *
 * @param jwtIdToken - The Cognito JWT ID Token.
 * @returns A promise that resolves to AWS credentials.
 */
export const getAwsCredentials = async (jwtIdToken: string) => {
  if (!jwtIdToken) {
    throw new Error('JWT ID Token is required to fetch AWS credentials');
  }

  const cognitoIdentityClient = new CognitoIdentityClient({ region: process.env.AWS_REGION });

  const credentialsProvider = fromCognitoIdentityPool({
    client: cognitoIdentityClient,
    identityPoolId: "us-east-1:e0a66a3c-899a-4094-8677-c01474825c27",//process.env.COGNITO_IDENTITY_POOL_ID!,
    logins: {
      //[`cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`]: jwtIdToken,
      [`cognito-idp.${process.env.AWS_REGION}.amazonaws.com/us-east-1_sf5GmNLta`]: jwtIdToken,
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
