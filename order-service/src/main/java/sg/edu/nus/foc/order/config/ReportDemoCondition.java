package sg.edu.nus.foc.order.config;

import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.core.env.Environment;
import org.springframework.core.type.AnnotatedTypeMetadata;

/** Local Compose uses prod security with emulator tokens; profile alone is insufficient. */
public class ReportDemoCondition implements Condition {

    @Override
    public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
        Environment environment = context.getEnvironment();
        String emulator = environment.getProperty("order.security.auth.emulator-host",
                environment.getProperty("FIREBASE_AUTH_EMULATOR_HOST", ""));
        return environment.getProperty("order.report-demo.enabled", Boolean.class, false)
                && "local".equals(environment.getProperty("FOC_ENVIRONMENT"))
                && !emulator.isBlank();
    }
}
