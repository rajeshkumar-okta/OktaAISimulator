// Extract public key from private JWK
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

// Extract only public key components
const publicJwk = {
  "kty": privateJwk.kty,
  "e": privateJwk.e,
  "n": privateJwk.n,
  "kid": privateJwk.kid,
  "alg": privateJwk.alg,
  "use": privateJwk.use
};

console.log('\n==== PUBLIC KEY TO REGISTER IN OKTA ====\n');
console.log(JSON.stringify(publicJwk, null, 2));
console.log('\n==== INSTRUCTIONS ====');
console.log('1. Copy the public key above');
console.log('2. Go to Okta Admin Console');
console.log('3. Applications → Your App (0oacu5hib9x0DjLFV0x7)');
console.log('4. General tab → Client Credentials section');
console.log('5. Add this public key (using JWKS or direct upload)');
console.log('6. Make sure the kid matches: f40e6f4ecb83e9964eeb8b5edcdfd3e6\n');
