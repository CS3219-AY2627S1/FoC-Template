package sg.edu.nus.foc.order.security.annotation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.security.access.prepost.PreAuthorize;

/** Shared reads accept any recognized Order Service role, without a role hierarchy. */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@PreAuthorize("hasAnyRole('REQUESTER', 'COURIER', 'ADMIN')")
public @interface RequireOrderRole {
}
