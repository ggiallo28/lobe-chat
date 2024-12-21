# Setting up Amazon Cognito Authentication

To enable Amazon Cognito authentication in LobeChat, follow these steps:

1. **Create a Cognito User Pool**

   - Go to the AWS Console and navigate to Amazon Cognito
   - Create a new User Pool
   - Configure the user pool settings according to your needs
   - Under "App integration", create a new app client
   - Note down the User Pool ID and App Client ID

2. **Configure Environment Variables**
   Add the following environment variables to your deployment:

   ```env
   COGNITO_CLIENT_ID=your_client_id
   COGNITO_CLIENT_SECRET=your_client_secret
   COGNITO_ISSUER=https://cognito-idp.{region}.amazonaws.com/{userPoolId}
   NEXT_AUTH_SSO_PROVIDERS=cognito
   ```

3. **Configure Allowed Callback URLs**
   In your Cognito User Pool app client settings, add the following callback URLs:

   - <http://localhost:3000/api/auth/callback/cognito> (for development)
   - <https://your-domain.com/api/auth/callback/cognito> (for production)

4. **Enable Cognito Provider**
   Ensure that 'cognito' is included in your `NEXT_AUTH_SSO_PROVIDERS` environment variable.

The Cognito provider is now integrated and ready to use in your LobeChat application.
