# AWS staging review checklist

Nominated editor: **Jun Hui**. Approval is required from Gateway, User, Supplier, Order, Credit and
Admin owners for their affected runtime contracts.

- [ ] Terraform plan contains only the expected staging resources and no secret values.
- [ ] GitHub OIDC subjects name this repository and the two protected environments exactly.
- [ ] No long-lived AWS access key is stored in GitHub, Git, an image or Terraform state.
- [ ] Service environment variables match the owning service documentation.
- [ ] RDS, ALB, MSK and application Services have no public endpoint.
- [ ] MSK has three brokers in three AZs, RF3/minISR2 topics and no under-replicated partitions.
- [ ] MSK SCRAM identities are associated and ACL lockdown rejects an unauthorized principal.
- [ ] Kafbat can inspect MSK but cannot publish, alter topics or use business consumer groups.
- [ ] Migrations are compatible with the previous image before exercising rollback.
- [ ] HPA and EKS Auto Mode evidence is captured under controlled load.
- [ ] CloudWatch logs, dashboard and alarms are visible to the demonstration operator.
- [ ] `destroy-staging` cleanup is verified in AWS after the demonstration.
- [ ] Production follow-ups for RDS/RabbitMQ HA, backup, private CI runners and incident response are
  recorded rather than implied by this staging design.

