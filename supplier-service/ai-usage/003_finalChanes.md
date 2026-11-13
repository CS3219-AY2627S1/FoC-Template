Made some final changes to the service to enhance UI output and prepare for D4. Since I was running short on time I thought about delegating work to AI 

Prompt: 

```
Ok now in @supplier-repository.ts  update each of the functions searchSuppliersService, getNearbySuppliersService,  filterSuppliersByCategoryService, getAllSuppliersService to include the isOpen query. Add in a new function to support multiple row queries instead of running it one by one in the supplier-service/src/database/repository-helpers.ts

Update the relevant test in supplier.test.ts or test.supplier.ts i forgot the name

Please also refer to the instructions written in `data\HANDOFF.md`
```

Why I find this relevant 
- It created the new function in the REST side that mimics my isOpen boolean I created a while ago for supplier, instead it takes in many rows and performs sql join operations 
- Changed each db query for my 4 specified functions with return type PublicSupplier(this is what I refactored to include isOpen), which was very reptitive 
- Added in tests, verified by me those are some good testcases to check correct isOpen status returned
