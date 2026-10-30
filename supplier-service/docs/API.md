## API Overview


| Method | Route                           | Notes                                                                                            |
| ------ | ------------------------------- | ------------------------------------------------------------------------------------------------ |
| GET    | `/suppliers`                    | public; active suppliers only                                                                    |
| GET    | `/suppliers/search?q=coffee`    | public; full-text search over name, building, description                                        |
| GET    | `/suppliers/category?type=food` | public; filter by category                                                                       |
| GET    | `/supplier/:id`                 | public; 404 if missing or soft-deleted                                                           |
| POST   | `/supplier`                     | Bearer JWT required; 201 on success, 409 if the name is already taken                            |
| PUT    | `/supplier/:id`                 | Bearer JWT required; send `expectedUpdatedAt`; 409 if the row changed, 404 if missing or deleted |
| DELETE | `/supplier/:id`                 | Bearer JWT required; soft delete, 404 if already deleted                                         |


## API Design: Asymmetric Pattern 

1. `POST` for the creation of a new supplier takes all supplier fields in one request 
    - creation should be atomic to prevent "broken" or "partial" supplier entries

2. Nested `PUT` for updating opening hours to ensure granular UI changes can be applied. Faster than sending the entire supplier payload
    - `PUT /supplier/:id/opening-hours/{day_of_week}`
    - Where {day_of_week} is an int of 0 to 6
        - Monday: 0
        - Tuesday: 1 
        - Wednesday: 2
        - Thursday: 3
        - Friday: 4
        - Saturday: 5
        - Sunday: 6

## Drizzle-zod usage 

Parameters for validation 


## Error handling switch case

