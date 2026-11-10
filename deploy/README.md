## Design decisions for deployment

We use ECS Fargate + managed database (Neon) + managed broker (AmazonMQ)


### Secret management

Secrets are delivered via .env files that are kept outside of Git always. 

### How our deployment differs from prod

For the purposes of the coursework, our deployment is not the same.

1. We deliberately expose many microservices ports.

Prod will likely only keep the user-facing UI port exposed.

We choose to expose these ports for convenience of demonstrating backend work for presentations; changing involves a simple networking change.