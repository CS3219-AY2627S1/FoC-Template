# Diagrams

PNG diagrams (2× resolution) used in the README, the docs and the D4 slides. The Mermaid sources are
in `source/` and share one theme, `source/mermaid-config.json`.

| Diagram | Shows | Used in |
| --- | --- | --- |
| [01-architecture-components.png](01-architecture-components.png) | Gateway, frontend, the five services, and the data store each one owns | [README](../../README.md#architecture) |
| [02-sync-http.png](02-sync-http.png) | Synchronous HTTP calls between services; grey lines are role lookups | [README](../../README.md#architecture) |
| [03-async-pubsub.png](03-async-pubsub.png) | Every Pub/Sub event: publisher, topic, subscriber | [README](../../README.md#architecture) |
| [04-cicd-pipeline.png](04-cicd-pipeline.png) | Pull-request checks, build once, deploy staging, manual production | [ci-cd.md](../ci-cd.md#pipeline) |
| [05-cloud-runtime.png](05-cloud-runtime.png) | Cloud Run services, internal ingress, data stores, Pub/Sub, NAT, Secret Manager | [ci-cd.md](../ci-cd.md#runtime-one-environment) |
| [06-errand-flow-sequence.png](06-errand-flow-sequence.png) | One errand from creation to payment (sync, then async) | [architecture.md](../architecture.md#an-errand-end-to-end) |
| [07-compensation-sequence.png](07-compensation-sequence.png) | What Order and Credit do when a Credit command's outcome is uncertain | [architecture.md](../architecture.md#compensation-when-credits-outcome-is-uncertain) |
| [08-order-lifecycle.png](08-order-lifecycle.png) | Order states and transitions | [demo.md](../demo.md#main-flows-show-these-first) |

Colour key:
- **blue:** services
- **green:** data stores
- **purple:** the gateway and Artifact Registry
- **yellow:** the frontend and production
- **orange:** Pub/Sub and async flows
- **red:** secrets

Solid arrows are synchronous; dotted arrows are asynchronous.

## Changing a diagram

Edit the `.mmd` file, then re-render it from this folder:

```bash
cd docs/diagrams/source
npx -y @mermaid-js/mermaid-cli@11.4.2 -c mermaid-config.json -i 05-cloud-runtime.mmd \
  -o ../05-cloud-runtime.png -s 2 -w 3000 -b white
```

The flowcharts use the ELK layout (`layout: elk` in each file's front matter), which mermaid-cli
11.4 includes.
