# FoC common penalty policy

Effective CHANGE-186 (2026-11-10): courier unresponsiveness is selectable at 3 points.
Bad attitude is retired from new selections; its 2-point enum value remains readable
for historical rows and pending events. Do not use values() as an active-choice API.

Ordinary Maven library in the monorepo. No Git submodule, separate repository,
server or container. Currently contains only `PenaltySystemPolicy` under
`sg.edu.nus.foc.common.penalty`.

CHANGE-132 renames the Java type from CourierPenaltyCase; the six constant names,
amounts and serialized event reasons remain unchanged. The shared query API is:

| Static method | Result |
| --- | --- |
| `getSuccessfulDeliveryReward()` | `SUCCESSFUL_DELIVERY` policy, amount1 |
| `getCourierPenaltyCases()` | Immutable ascending list: unresponsive3, wrong location4, damage4, theft10; excludes automatic outcomes and retired bad attitude |
| `getFullPenaltyPolicy()` | Immutable list of all seven active policies in declaration order |

For example, `PenaltySystemPolicy.getSuccessfulDeliveryReward().getPenaltyAmount()`
returns1. Order completion and penalty event direction use the reward helper.
The courier-case subset is for report selections, not all automatic addition
events. The methods do not publish, mutate user scores or enforce suspension.


| Reason | Positive amount | Existing event direction |
| --- | --- | --- |
| ACCEPTED_TASK_CANCELLATION | 2 | Addition |
| OVERDUE_DELIVERY | 1 | Addition |
| SUCCESSFUL_DELIVERY | 1 | Deduction |
| WRONG_LOCATION_DELIVERY | 4 | Admin cancellation addition |
| ITEM_MISHANDLING_OR_DAMAGE | 4 | Admin cancellation addition |
| DELIBERATE_ITEM_RETENTION_OR_THEFT | 10 | Admin cancellation addition; suspension enforcement belongs to User Service |
| COURIER_BAD_ATTITUDE (retired) | 2 | Historical compatibility only; no new selection |
| COURIER_UNRESPONSIVE | 3 | Admin-confirmed misconduct; existing deferred final-outcome addition |

Direction stays in the existing event type; the enum does not apply scores.
Order is the first consumer. User's old HTTP outcome handlers and the pending
User event consumer are not changed by adding this module.

The full mapping follows Project D1 NTH2 (PDF37-39), CHANGE-131. Report-related
cases require administrator confirmation, not report submission alone. These
constants do not introduce new Order publication flows or change existing event
schemas. Successful delivery means no confirmed complaint. D1 additionally
requires the highest applicable effective penalty per errand, a one-month
suspension at score10 and permanent suspension for deliberate retention/theft.
Those scoring/report/suspension responsibilities are not implemented by this
lookup enum and remain future User/Report integration work; no extra score case
is needed to represent them.

From the repository root in PowerShell:

```powershell
.\mvnw.cmd -pl foc-common verify
.\mvnw.cmd -pl order-service -am verify
docker compose up -d --build order-service
```

On Linux/macOS use `bash ./mvnw` with the same arguments. The root reactor builds
common before Order without a preinstalled local common artifact. The Order
image bundles the common JAR; root-context Docker build is
`docker build -f order-service/Dockerfile .`. Other images remain standalone.

To adopt from another backend, add dependency `sg.edu.nus.foc:foc-common:0.0.1-SNAPSHOT`,
add that service to the root reactor and explicitly update its Docker/CI build
context. Do not copy the enum or import Order implementation. Shared/root Maven
changes already cause all Maven backends to be validated conservatively.

`git pull` gets shared changes with application source. Rebuild/redeploy consuming
images to use them. Production promotes the exact staged image; no remote latest
policy is fetched at runtime. Policy changes need provider/consumer review.
