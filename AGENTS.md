# AGENTS.md

## Repository

Friend on Campus (FoC) is a Gradle multi-project monorepo containing Spring Boot microservices.

Services are organized as independent Gradle modules and own their source code, resources, migrations, and configuration.

Java packages are rooted at:

```text
com.cs3219.foc.<domain>
```

## Service structure

Services follow a package-by-responsibility structure:

| Package                    | Responsibility                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `controller`               | HTTP endpoints and request/response handling                                           |
| `service`                  | Application operations, orchestration, transactions, and application event publication |
| `repository`               | Persistence access                                                                     |
| `model/entity`             | JPA entities and related enums                                                         |
| `model/dto`                | Request, response, transfer, and event records                                         |
| `model/dto/event`          | Event contracts representing completed application facts                               |
| `mapper`                   | Entity/DTO mapping                                                                     |
| `infrastructure/messaging` | Asynchronous messaging transport and integration infrastructure                        |
| `config`                   | Application and framework configuration                                                |
| `security`                 | Authentication and security infrastructure                                             |
| `exception`                | Application exceptions and global error handling                                       |
| `scheduler`                | Scheduled tasks                                                                        |

The typical synchronous request flow is:

```text
controller → service → repository
```

Controllers expose DTOs rather than persistence entities.

Dependencies use constructor injection.

## Messaging

Asynchronous service integration uses Spring Cloud Stream.

Messaging infrastructure is organized as:

```text
infrastructure/
└── messaging/
    ├── consumer/
    ├── producer/
    └── processor/
```

* `consumer` receives integration events.
* `producer` publishes integration events.
* `processor` consumes an event and produces another event.

Event contracts live under:

```text
model/
└── dto/
    └── event/
```

Events are records representing completed facts, for example:

```text
UserCreatedEvent
CreditsAllocatedEvent
```

Application services may create and publish these events through Spring's `ApplicationEventPublisher`.

Messaging infrastructure may listen for the same event types and transport them through Spring Cloud Stream.

Messaging bindings and transport configuration live in the owning service's application configuration.

## Persistence

Persistence uses Spring Data JPA.

Database schema changes are managed through Flyway migrations under:

```text
src/main/resources/db/migration/
```

Persisted models live under `model/entity`.

## Configuration

Service configuration lives under:

```text
src/main/resources/
```

Typed application properties use Spring `@ConfigurationProperties` classes under `config`.

Configuration belongs to the service that owns the corresponding behavior.

## Naming

Classes are named by responsibility:

```text
AuthController
UserService
UserRepository
UserMapper
SecurityConfig
AuthProperties
RefreshTokenCleanupJob
```

DTOs use records and role-oriented names such as:

```text
RegisterUserRequest
AccessTokenResponse
UserProfileDto
```

Entities use domain names without an `Entity` suffix.

Integration events use completed-fact names ending in `Event`.

Service directories use kebab-case:

```text
user-service
```

Java domain packages use singular domain names:

```text
com.cs3219.foc.user
```
