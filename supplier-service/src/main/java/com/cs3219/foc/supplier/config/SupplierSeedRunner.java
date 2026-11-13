package com.cs3219.foc.supplier.config;

import com.cs3219.foc.supplier.service.SupplierSeedService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@Profile("supplier-seed")
@RequiredArgsConstructor
public class SupplierSeedRunner implements ApplicationRunner {
    private final SupplierSeedService supplierSeedService;
    private final ConfigurableApplicationContext context;

    @Override
    public void run(ApplicationArguments args) {
        var inserted = supplierSeedService.seedMissingSuppliers();
        log.info("Supplier seed inserted {} suppliers. Existing suppliers were left unchanged.", inserted);
        System.exit(SpringApplication.exit(context));
    }
}
