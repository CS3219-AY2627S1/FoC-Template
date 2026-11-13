package com.friendoncampus.gateway;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;

@RestController
class UserOpenApiYamlController {

    private static final String OPENAPI_YAML_MEDIA_TYPE = "application/vnd.oai.openapi";

    private final RestClient userService;
    private final ObjectMapper jsonMapper = new ObjectMapper();
    private final YAMLMapper yamlMapper = new YAMLMapper();

    UserOpenApiYamlController(
            RestClient.Builder restClientBuilder,
            @Value("${USER_SERVICE_URL:http://localhost:8081}") String userServiceUrl) {
        this.userService = restClientBuilder.baseUrl(userServiceUrl).build();
    }

    @GetMapping(value = "/docs/user/openapi.yaml", produces = OPENAPI_YAML_MEDIA_TYPE)
    String userOpenApiYaml() throws Exception {
        String json = userService.get()
                .uri("/v3/api-docs")
                .accept(MediaType.APPLICATION_JSON)
                .retrieve()
                .body(String.class);
        JsonNode specification = jsonMapper.readTree(json);
        return yamlMapper.writeValueAsString(specification);
    }
}
