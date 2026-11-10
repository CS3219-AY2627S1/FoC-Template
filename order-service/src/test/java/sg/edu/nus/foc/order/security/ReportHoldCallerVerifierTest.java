package sg.edu.nus.foc.order.security;

import static org.junit.jupiter.api.Assertions.*;
import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jwt.*;
import java.security.*;
import java.security.interfaces.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.*;
import sg.edu.nus.foc.order.config.ReportHoldSettings;
import sg.edu.nus.foc.order.domain.OrderProblem;

class ReportHoldCallerVerifierTest {
    static final String AUD="https://order.example.run.app", ACCOUNT="report@demo.iam.gserviceaccount.com";
    static final String LOCAL="test-report-hold-development-credential";
    static KeyPair keys;
    @BeforeAll static void keys()throws Exception{var generator=KeyPairGenerator.getInstance("RSA");generator.initialize(2048);keys=generator.generateKeyPair();}
    ReportHoldSettings cloud(){return new ReportHoldSettings("google",AUD,ACCOUNT,"","staging","real-auth","");}
    ReportHoldCallerVerifier verifier(){
        var settings=cloud();var decoder=NimbusJwtDecoder.withPublicKey((RSAPublicKey)keys.getPublic()).build();
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefault(),new ReportingServiceTokenValidator(settings)));
        return new ReportHoldCallerVerifier(settings,decoder);
    }
    String token(String issuer,String audience,String account,boolean verified,Instant expires)throws Exception{
        var claims=new JWTClaimsSet.Builder().issuer(issuer).audience(audience).subject("service-id")
                .issueTime(Date.from(Instant.now().minusSeconds(5))).expirationTime(expires==null?null:Date.from(expires))
                .claim("email",account).claim("email_verified",verified).build();
        var jwt=new SignedJWT(new JWSHeader(JWSAlgorithm.RS256),claims);jwt.sign(new RSASSASigner((RSAPrivateKey)keys.getPrivate()));return jwt.serialize();
    }
    @Test void acceptsSignedExpectedServiceAndBothGoogleIssuerFormats()throws Exception{
        for(String issuer:List.of("accounts.google.com","https://accounts.google.com"))
            assertDoesNotThrow(()->verifier().requireReportingCall("Bearer "+token(issuer,AUD,ACCOUNT,true,Instant.now().plusSeconds(300))));
    }
    @Test void rejectsWrongSignatureIdentityAudienceIssuerVerificationExpiryAndMissingExpiry()throws Exception{
        for(String[] wrong:List.of(new String[]{"https://attacker",AUD,ACCOUNT},new String[]{"https://accounts.google.com","other",ACCOUNT},
                new String[]{"https://accounts.google.com",AUD,"other@demo.iam.gserviceaccount.com"})){
            String jwt=token(wrong[0],wrong[1],wrong[2],true,Instant.now().plusSeconds(300));
            assertEquals("UNAUTHENTICATED",assertThrows(OrderProblem.class,()->verifier().requireReportingCall("Bearer "+jwt)).getCode());
        }
        for(String jwt:List.of(token("https://accounts.google.com",AUD,ACCOUNT,false,Instant.now().plusSeconds(300)),
                token("https://accounts.google.com",AUD,ACCOUNT,true,Instant.now().minusSeconds(120)),
                token("https://accounts.google.com",AUD,ACCOUNT,true,null))){
            assertThrows(OrderProblem.class,()->verifier().requireReportingCall("Bearer "+jwt));
        }
        String valid=token("https://accounts.google.com",AUD,ACCOUNT,true,Instant.now().plusSeconds(300));
        String tampered=valid.substring(0,valid.lastIndexOf('.')+1)+Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[256]);
        assertThrows(OrderProblem.class,()->verifier().requireReportingCall("Bearer "+tampered));
    }
    @Test void missingProofAndLocalProofNeverPassCloudValidation(){
        for(String proof:Arrays.asList(null,"","Bearer ","Local "+LOCAL))assertThrows(OrderProblem.class,()->verifier().requireReportingCall(proof));
        var unavailable=new ReportHoldCallerVerifier(cloud(),token->{throw new JwtException("JWKS unavailable");});
        assertEquals("SERVICE_UNAVAILABLE",assertThrows(OrderProblem.class,()->unavailable.requireReportingCall("Bearer token")).getCode());
        var unconfigured=new ReportHoldCallerVerifier(new ReportHoldSettings("google","","",""),null);
        assertEquals("SERVICE_UNAVAILABLE",assertThrows(OrderProblem.class,()->unconfigured.requireReportingCall("Bearer token")).getCode());
        var noAccount=new ReportHoldCallerVerifier(new ReportHoldSettings("google",AUD,"",""),null);
        assertEquals("SERVICE_UNAVAILABLE",assertThrows(OrderProblem.class,()->noAccount.requireReportingCall("Bearer token")).getCode());
    }
    @Test void missingRequiredClaimsAndStringVerificationAreHandledWithoutServerErrors(){
        var base=new HashMap<String,Object>();base.put("iss","https://accounts.google.com");base.put("aud",List.of(AUD));
        base.put("email",ACCOUNT);base.put("email_verified",true);base.put("sub","service-id");base.put("iat",Instant.now());base.put("exp",Instant.now().plusSeconds(300));
        var validator=new ReportingServiceTokenValidator(cloud());
        for(String missing:List.of("iss","aud","email","email_verified","sub","iat","exp")){
            var claims=new HashMap<>(base);claims.remove(missing);
            var jwt=Jwt.withTokenValue("token").header("alg","RS256").claims(values->values.putAll(claims)).build();
            assertTrue(validator.validate(jwt).hasErrors(),missing);
        }
        base.put("email_verified","true");
        assertFalse(validator.validate(Jwt.withTokenValue("token").header("alg","RS256").claims(values->values.putAll(base)).build()).hasErrors());
        base.put("sub","");assertTrue(validator.validate(Jwt.withTokenValue("token").header("alg","RS256").claims(values->values.putAll(base)).build()).hasErrors());
    }
    @Test void localProofIsRequiredAndUnsafeLocalConfigurationIsRejected(){
        var local=new ReportHoldSettings("local","http://order-service:8080","",LOCAL,"local","demo-foc","firebase:9099");
        var receiver=new ReportHoldCallerVerifier(local);assertDoesNotThrow(()->receiver.requireReportingCall("Local "+LOCAL));
        for(String proof:Arrays.asList(null,"Local wrong","Bearer "+LOCAL))assertThrows(OrderProblem.class,()->receiver.requireReportingCall(proof));
        for(String[] invalid:List.of(new String[]{"staging","demo-foc","firebase:9099",LOCAL},new String[]{"local","real-project","firebase:9099",LOCAL},
                new String[]{"local","demo-foc","",LOCAL},new String[]{"local","demo-foc","firebase:9099","short"}))
            assertThrows(IllegalStateException.class,()->new ReportHoldSettings("local","","",invalid[3],invalid[0],invalid[1],invalid[2]));
        assertThrows(IllegalStateException.class,()->new ReportHoldSettings("unknown","","","","local","demo-foc","firebase:9099"));
    }
}
