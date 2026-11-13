package com.friendoncampus.user.web;
import java.net.URI;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.service.RegistrationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

@RestController @RequestMapping("/api/users")
public class RegistrationController {
 private final RegistrationService registrationService;
 public RegistrationController(RegistrationService registrationService) { this.registrationService=registrationService; }
 @PostMapping("/registrations") @Operation(summary="Register an eligible NUS student")
 @ApiResponse(responseCode="201", description="Account created as UNVERIFIED; verification OTP sent")
 @ApiResponse(responseCode="400", description="Invalid input or email/username already taken")
 @ApiResponse(responseCode="503", description="Verification email delivery unavailable")
 public ResponseEntity<Response> register(@Valid @RequestBody Request request) {
  User user=registrationService.register(request.email(),request.username(),request.password());
  return ResponseEntity.created(URI.create("/api/users/"+user.getId())).body(new Response(user));
 }
 public record Request(@NotBlank @Email String email, @NotBlank @Size(max=20) String username, @NotBlank @Size(min=15,max=64) String password) {}
 public record Response(java.util.UUID id,String email,String username,java.util.Set<com.friendoncampus.user.domain.UserRole> roles,String status,java.time.OffsetDateTime createdAt) { Response(User u){this(u.getId(),u.getEmail(),u.getUsername(),u.getRoles(),u.getStatus().name(),u.getCreatedAt());} }
}
