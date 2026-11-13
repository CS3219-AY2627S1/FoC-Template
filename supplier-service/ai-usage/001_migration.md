### AI declaration 1st Nov 2026 - Grok Usage For Migration From Supabase to Postgres


### Why did I choose to use AI? 
- Because applying migration requires many checks, verification with postgres libraries, writing some new SQL migration files possibly, removing supabase etc. 
- I feel this is a lot of manual work and did not fit my timeline. Hence I used AI to optimize it
- Also grok is amazing, it updates my documentation too! 
- I instructed and reviewed the chat based on 
    - Change dockerfile image from postgres 17 to postgres 16 to match user service
    - Specifically mentioned to update runtime and my dependencies in package.json
    - Specifically mentioned to keep testcontainers config, since this helps me with my CI
    - Took feedback from D2 to remove inefficient indexing for deleted_at (just an extra request I threw in there)
    - I didnt see any issues with the migration since supabase is basically postgres


### Prompt

```
Migrate from supabase to PostgreSQL plain container. Change the elements in the dockerfile, package.json, as well as the tests if needed. Keep testcontainers working with PostgreSQL. I will need you to make sure PostgreSQL is replacing supabase well. Alert me if i didnt catch any misconfigurations

- also remove inefficient indexing for deleted_at 
```