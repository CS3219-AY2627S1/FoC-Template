/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-01
 * Scope: Generated the configuration-gated seed runner.
 */
package com.campuscouriers.supplier.importer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "supplier.seed.enabled", havingValue = "true")
public class SupplierSeedRunner implements ApplicationRunner {

    private static final Logger LOGGER = LoggerFactory.getLogger(SupplierSeedRunner.class);

    private final SupplierSeedImporter importer;
    private final ResourceLoader resourceLoader;
    private final String seedFile;

    public SupplierSeedRunner(
            SupplierSeedImporter importer,
            ResourceLoader resourceLoader,
            @Value("${supplier.seed.file}") String seedFile
    ) {
        this.importer = importer;
        this.resourceLoader = resourceLoader;
        this.seedFile = seedFile;
    }

    @Override
    public void run(ApplicationArguments arguments) {
        SupplierSeedImportSummary summary = importer.importFrom(resourceLoader.getResource(seedFile));
        LOGGER.info("Supplier seed import complete: totalRows={}, createdSuppliers={}, "
                        + "skippedSuppliers={}, createdCategories={}, createdBuildings={}",
                summary.totalRows(), summary.createdSuppliers(), summary.skippedSuppliers(),
                summary.createdCategories(), summary.createdBuildings());
    }
}
