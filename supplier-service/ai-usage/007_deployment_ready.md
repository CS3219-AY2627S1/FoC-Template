### Used by @sunpterodactyl to finish some config work with k8, supplier compose.yaml, and order env.example 

Prompt

```
Can you add redis to the order k8 so the deployed service uses redis please? And also in supplier-service/src/api/supplier-controller.ts please ovserve the type mismatch for event publisher and lmk if it will fail. so far it looks fine? 

lastly add rabbitmq to supplier compose.yaml
```


It did everything I specified. I wanted to check on a type mismatch in supplier events, but the event runs through in javascript 