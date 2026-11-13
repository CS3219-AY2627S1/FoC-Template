package com.friendoncampus.admin;

import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.interfaces.RSAPrivateCrtKey;
import java.security.spec.*;
import java.time.Instant;
import java.util.*;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import tools.jackson.databind.json.JsonMapper;

/** Explicit local contract fixture only. Not component-scanned or included in the application jar. */
public final class ReportEligibilityFixture {
    public static void main(String[] args) throws Exception {
        UUID order=UUID.fromString(args[0]);
        Set<UUID> participants=new HashSet<>();
        for(String id:args[1].split(",")) participants.add(UUID.fromString(id));
        int port=Integer.parseInt(args[2]);
        boolean incomplete=args.length>3 && Boolean.parseBoolean(args[3]);
        UUID timelineCase=args.length>4 && !args[4].isBlank()?UUID.fromString(args[4]):null;
        Map<String,Object> timeline=timelineCase==null?null:EvidencePreviewData.create(timelineCase,order,participants.stream().sorted().findFirst().orElseThrow(),incomplete);
        var json=JsonMapper.builder().build();
        var factory=KeyFactory.getInstance("RSA");
        var privateKey=(RSAPrivateCrtKey)factory.generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(required("ADMIN_SERVICE_PRIVATE_KEY"))));
        var publicKey=factory.generatePublic(new RSAPublicKeySpec(privateKey.getModulus(),privateKey.getPublicExponent()));
        String trust=json.writeValueAsString(Map.of(required("ADMIN_SERVICE_KEY_ID"),Map.of("subject","admin-service","publicKey",Base64.getEncoder().encodeToString(publicKey.getEncoded()))));
        var services=new ServiceTokens("chat-service","chat-service","unused","",trust);
        JwtDecoder users=new SecurityConfiguration().userJwtDecoder(System.getenv().getOrDefault("ADMIN_USER_JWKS","http://localhost:8081/.well-known/jwks.json"),"friend-on-campus-user-service","friend-on-campus-api");
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",port),0);
        server.createContext("/",exchange->{
            int status=401; Object body=Map.of("title","Unauthorized","status",401);
            try {
                String assertion=exchange.getRequestHeaders().getFirst("Authorization");
                if(assertion==null || !assertion.startsWith("Bearer ")) throw new IllegalArgumentException();
                services.decode(assertion.substring(7),Set.of("admin-service"));
                var actor=users.decode(exchange.getRequestHeaders().getFirst("X-Actor-Token"));
                UUID user=UUID.fromString(actor.getSubject());
                String expected="/internal/chat/orders/"+order+"/report-eligibility?userId="+user;
                if(timelineCase!=null && exchange.getRequestMethod().equals("GET") && exchange.getRequestURI().getPath().equals("/internal/chat/cases/"+timelineCase+"/timeline")) {
                    if(!"ADMIN".equals(actor.getClaimAsString("role"))) {status=403;body=Map.of("title","Forbidden","status",403);}
                    else {
                        Map<String,String> query=new HashMap<>();String raw=exchange.getRequestURI().getRawQuery();
                        if(raw!=null)for(String item:raw.split("&")){String[] parts=item.split("=",2);query.put(parts[0],parts.length==2?URLDecoder.decode(parts[1],StandardCharsets.UTF_8):"");}
                        int limit=Integer.parseInt(query.getOrDefault("limit","20"));String cursor=query.get("cursor");int offset=cursor==null?0:Integer.parseInt(cursor.replace("fixture-page-",""));
                        if(limit<1||limit>100||offset<0||offset>25)throw new IllegalArgumentException();
                        @SuppressWarnings("unchecked") var records=(List<Map<String,Object>>)timeline.get("records");int end=Math.min(offset+limit,records.size());
                        var page=new LinkedHashMap<>(timeline);page.put("records",records.subList(offset,end));page.put("nextCursor",end<records.size()?"fixture-page-"+end:null);body=page;status=200;
                    }
                } else if(!exchange.getRequestMethod().equals("GET") || !expected.equals(exchange.getRequestURI().toString())) {
                    status=404; body=Map.of("title","Not found","status",404);
                } else if(!Set.of("REQUESTER","COURIER").contains(actor.getClaimAsString("role"))) {
                    status=403; body=Map.of("title","Forbidden","status",403);
                } else {
                    String now=Instant.now().toString(); status=200;
                    var checkpoint=Map.of("source","order-service","stream","order.lifecycle.events","aggregateId",order,"committedSequence",1,"projectedSequence",incomplete?0:1,"checkedAt",now);
                    body=Map.of("orderId",order,"userId",user,"eligible",participants.contains(user),"evidenceRevision","explicit-local-fixture-1",
                            "coverage",Map.of("status",incomplete?"INCOMPLETE":"COMPLETE","asOf",now,"checkpoints",List.of(checkpoint),"blockingGaps",List.of()));
                }
            } catch(Exception ignored) { /* No tokens, keys or claims are logged. */ }
            byte[] bytes=json.writeValueAsString(body).getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type","application/json"); exchange.sendResponseHeaders(status,bytes.length);
            try(var output=exchange.getResponseBody()){output.write(bytes);}
        });
        Runtime.getRuntime().addShutdownHook(new Thread(()->server.stop(0)));
        server.start();
        System.out.println("TEST-ONLY eligibility fixture on 127.0.0.1:"+port+"; errand "+order+"; incomplete="+incomplete);
        if(timelineCase!=null)System.out.println("TEST-ONLY synthetic timeline for case "+timelineCase+" (25 records)");
    }
    private static String required(String name){String value=System.getenv(name); if(value==null || value.isBlank()) throw new IllegalArgumentException("Missing "+name); return value;}
}
