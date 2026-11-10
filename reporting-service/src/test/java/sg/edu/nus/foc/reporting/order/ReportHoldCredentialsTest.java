package sg.edu.nus.foc.reporting.order;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.google.auth.oauth2.*;
import java.io.IOException;
import java.util.*;
import java.util.function.Function;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import sg.edu.nus.foc.reporting.error.DependencyUnavailableException;
import sg.edu.nus.foc.reporting.config.ReportingProperties;

class ReportHoldCredentialsTest {
    static final String LOCAL="test-report-hold-development-credential";
    @Test void cloudCredentialsAreCachedRefreshedAndScopedToTheOrderAudience()throws Exception{
        var credentials=mock(IdTokenCredentials.class);
        when(credentials.getAccessToken()).thenReturn(new AccessToken("google-id-token",new Date(System.currentTimeMillis()+300000)));
        @SuppressWarnings("unchecked") Function<String,IdTokenCredentials> factory=mock(Function.class);
        when(factory.apply("https://order.run.app")).thenReturn(credentials);
        var provider=new ReportHoldCredentials("google","https://order.run.app","","staging","real-project","",factory);
        assertEquals("Bearer google-id-token",provider.get());assertEquals("Bearer google-id-token",provider.get());
        verify(factory).apply("https://order.run.app");verify(credentials,times(2)).refreshIfExpired();
        doThrow(new IOException("metadata unavailable")).when(credentials).refreshIfExpired();
        assertThrows(DependencyUnavailableException.class,provider::get);
    }
    @Test void localModeDoesNotDiscoverCloudCredentialsAndIsUnavailableOutsideDemoEmulators(){
        var provider=new ReportHoldCredentials("local","http://order-service:8080",LOCAL,"local","demo-foc","firebase:9099",aud->{throw new AssertionError("No ADC in local mode");});
        assertEquals("Local "+LOCAL,provider.get());
        for(String[] invalid:List.of(new String[]{"production","demo-foc","firebase:9099",LOCAL},new String[]{"local","real","firebase:9099",LOCAL},
                new String[]{"local","demo-foc","",LOCAL},new String[]{"local","demo-foc","firebase:9099","short"}))
            assertThrows(IllegalStateException.class,()->new ReportHoldCredentials("local","",invalid[3],invalid[0],invalid[1],invalid[2],null));
        assertThrows(IllegalStateException.class,()->new ReportHoldCredentials("unknown","","","local","demo-foc","firebase:9099",null));
        assertThrows(DependencyUnavailableException.class,()->new ReportHoldCredentials("google","http://order","","local","demo-foc","",null).get());
    }
    @Test void missingTokenFailsBeforeAnyOrderCall()throws Exception{
        var credentials=mock(IdTokenCredentials.class);
        var provider=new ReportHoldCredentials("google","https://order.run.app","","staging","real","",aud->credentials);
        assertThrows(DependencyUnavailableException.class,provider::get);
    }
    ReportingProperties properties(){return new ReportingProperties(null,null,new ReportingProperties.Auth("real-auth",""),null,null,null);}
    @Test void attachedAdcIdentityProvidesAFullGoogleIdTokenWithoutKeyFiles()throws Exception{
        var source=mock(GoogleCredentials.class,withSettings().extraInterfaces(IdTokenProvider.class));
        String header=Base64.getUrlEncoder().withoutPadding().encodeToString("{\"alg\":\"RS256\"}".getBytes(StandardCharsets.UTF_8));
        String claims="{\"iss\":\"https://accounts.google.com\",\"aud\":\"https://order.run.app\",\"exp\":"+Instant.now().plusSeconds(300).getEpochSecond()+"}";
        String raw=header+"."+Base64.getUrlEncoder().withoutPadding().encodeToString(claims.getBytes(StandardCharsets.UTF_8))+"."+Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[256]);
        when(((IdTokenProvider)source).idTokenWithAudience(eq("https://order.run.app"),anyList())).thenReturn(IdToken.create(raw));
        try(var adc=mockStatic(GoogleCredentials.class)){
            adc.when(GoogleCredentials::getApplicationDefault).thenReturn(source);
            var provider=new ReportHoldCredentials("google","https://order.run.app","","staging",properties());
            assertEquals("Bearer "+raw,provider.get());assertEquals("Bearer "+raw,provider.get());
            verify((IdTokenProvider)source).idTokenWithAudience("https://order.run.app",List.of(IdTokenProvider.Option.FORMAT_FULL));
        }
    }
    @Test void unavailableOrIncompatibleAdcFailsClosed()throws Exception{
        try(var adc=mockStatic(GoogleCredentials.class)){
            adc.when(GoogleCredentials::getApplicationDefault).thenThrow(new IOException("No metadata server"));
            assertThrows(DependencyUnavailableException.class,()->new ReportHoldCredentials("google","https://order.run.app","","staging",properties()).get());
            adc.when(GoogleCredentials::getApplicationDefault).thenReturn(mock(GoogleCredentials.class));
            assertThrows(DependencyUnavailableException.class,()->new ReportHoldCredentials("google","https://order.run.app","","staging",properties()).get());
        }
    }
}
