import { SignJWT, importJWK } from 'jose';
import crypto from 'crypto';

const privateJwk = {
  "alg": "RS256",
  "d": "Ra80AeJHa_LJseUiEckPudnJSC1C0K9S3CimQpRqXs5JBvQ5gOhw3ZcykArj6r2ZZAptj5kClL9hT4CqMbA3BTqJCuP0IbqrGpkf5_wRWJ2Hde6XIC1TrTS8Re5MNEYcUPkKvEpwwDdSR29OpnbLkiQiV6dpZrrZ9n498cedsL5auGAUwY364getHdqfCnietFHYdCEYPw7WdXm3qszvBhCrmIJKWhLYL_6E0RrvpW7EOj1uhiFx453fP4oRC6derR7usCdxTB554E_Bjb0DM4hfTzwU_IhvTNgqSzdHSMKwcSTkGduaVz7bj8NeNZkUSvNgRoOgSxxTDTiFyOV0EQ",
  "dp": "CG0vwa6yfBXv42gS3Lnv51ML1s6kgZaiaOrKffYAdsUHpzMtWRSEcOFSSe3AQitzXnvmlpUbU8fTRo6MtIrHEhP_lMzHctH6pjSDj9Z77eFGii8kRWY2dd_Q5GIiRREbtkFxELp9pNRE2X1rl7Uk5EcpwtE1pHA4I31uhnn4vNE",
  "dq": "mLsyTjcOYTJZwa4dFbl4wNXLmee-cl0sF28J95_tNmx_bY2RKDplILqHrGYBLK27UK8BaSsmi5WLH3QorKHBhtD9PEvGII86uo4C59hvWJYexn62zO-jhlBv47cYVl3wYw7bwnUA-Qs7k9XFSB4zxxW_IOXspT933KwHmTauFPU",
  "e": "AQAB",
  "kty": "RSA",
  "n": "wj_nGS7wdXLHpxdqdsEQKdRLQz0O_6iUhFYoB5BsI3uRtd9DM41cWnFSJx4JQyavCGNHgFMgbfRGAKRlI3l88qPeJskjI9aRBPDHDvdfz-csqkz2WwCR79WuPl24kKvf3kJ4_9rb4jse1C9CE24tn4iIrF3DfiS8PNOpCuwNLeipnNQtzMVlXM7xdpDyReIVus2I8_omz8iZ5pnMNs_IlXtIZgqC7Pcy-zgglk2zE-NullTsF3rHD2ivTwIRLKFcaE8lJrgFTQIOq3P-Q5qruDrY_KB_thNowTiRRzbnVXxeH59y096wnhEZve5CrLaCd3_y3VgnxT4GP2VC7T_oHw",
  "p": "7IJEghP42ZBjQhs4HJfOJPEbgKfjFNij91xbvPT5LXGFA31fvYu7vYjYHrPS0j_6Eo7dFD_MWV67TNXts2raRPf1j_3VovdH1O5StD8f8aj-vBm0aRWVOV6zKsLI_Bg0jjb2evaAo1kZTKpGEkfEg5G14kkRZL2DpBP0lnmcGTE",
  "q": "0kISviIeLgN6nghRU_pFKq23XAbMjIWnd_H7q1jk5kBIEbU_Bdvp55WdPghltpSypxRvVg2oQRxlmLoltgphHsiO-7FUcFp9AOsL5OpeEXlSuDf_Sc2EzUTKLByAOnRiIizXfkGlJzlyDRtVllczVxzNio_HykpYGvOJViuNwk8",
  "qi": "ILITBQrioS-k6U-xJMBENVTJXZ0WJ30Sw4V8QVe8Ci9XC06GmqELEFVE1MiYX4qsijEWdEYogZ7cOaw1PA2Y7DDQG0mjYaL_3q2OpZUDa2GLQ8NDmD61oSnF3p2xJ91FZyHrouRfYo1PgQvL6PoqnfVdkyBkHw5S4HppcmufJwc",
  "kid": "f40e6f4ecb83e9964eeb8b5edcdfd3e6",
  "use": "sig"
};

const config = {
  oktaDomain: 'https://karaokebus-oie.oktapreview.com',
  clientId: '0oacu5hib9x0DjLFV0x7',
};

async function testClientAuth() {
  console.log('\n=== Testing Client Authentication ===\n');
  
  const tokenEndpoint = `${config.oktaDomain}/oauth2/v1/token`;
  
  // Create client assertion
  const privateKey = await importJWK(privateJwk, 'RS256');
  const clientAssertion = await new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: privateJwk.kid })
    .setIssuer(config.clientId)
    .setSubject(config.clientId)
    .setAudience(tokenEndpoint)
    .setIssuedAt()
    .setExpirationTime('5m')
    .setJti(crypto.randomUUID())
    .sign(privateKey);

  console.log('Client Assertion created');
  console.log('Client ID:', config.clientId);
  console.log('Token Endpoint:', tokenEndpoint);
  console.log('KID:', privateJwk.kid);
  
  // Try to use client_credentials grant to test auth
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: 'okta.users.read',
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: clientAssertion,
  });

  console.log('\nTesting with client_credentials grant...\n');
  
  try {
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const result = await response.text();
    console.log(`Response Status: ${response.status}`);
    console.log('Response Body:', result);
    
    if (response.ok) {
      console.log('\n✅ SUCCESS! Client authentication with private_key_jwt is working!');
    } else {
      console.log('\n❌ FAILED! Check the error message above.');
      console.log('\nCommon issues:');
      console.log('1. Token Endpoint Authentication Method is NOT set to "private_key_jwt"');
      console.log('2. Public key not registered or kid mismatch');
      console.log('3. Client may not have the required grant type enabled');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testClientAuth();
