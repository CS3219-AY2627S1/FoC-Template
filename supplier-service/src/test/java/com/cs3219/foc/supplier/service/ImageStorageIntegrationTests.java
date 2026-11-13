package com.cs3219.foc.supplier.service;

import static org.assertj.core.api.Assertions.*;
import static org.awaitility.Awaitility.await;
import static org.mockito.Mockito.*;

import com.cs3219.foc.supplier.config.TimeConfig;
import com.cs3219.foc.supplier.exception.StorageException;
import com.cs3219.foc.supplier.exception.SupplierImageException;
import com.cs3219.foc.supplier.infrastructure.storage.*;
import com.cs3219.foc.supplier.integration.AbstractIntegrationTest;
import com.cs3219.foc.supplier.mapper.*;
import com.cs3219.foc.supplier.model.dto.event.SupplierImageDeletionRequestedEvent;
import com.cs3219.foc.supplier.model.entity.*;
import com.cs3219.foc.supplier.repository.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.*;
import java.sql.SQLException;
import java.time.Duration;
import java.util.*;
import javax.imageio.ImageIO;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.AutoConfigurationPackage;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.*;
import org.springframework.dao.DataAccessException;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.modulith.events.IncompleteEventPublications;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.*;
import software.amazon.awssdk.auth.credentials.*;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;

@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@SpringBootTest(
        classes = ImageStorageIntegrationTests.Config.class,
        webEnvironment = SpringBootTest.WebEnvironment.NONE)
@Import(AbstractIntegrationTest.Aws.class)
class ImageStorageIntegrationTests extends AbstractIntegrationTest {
    static final String BUCKET = "foc-supplier-integration";

    @Configuration
    @ConfigurationPropertiesScan("com.cs3219.foc.supplier.config")
    @EnableAsync
    @EnableAutoConfiguration
    @AutoConfigurationPackage(basePackages = "com.cs3219.foc.supplier")
    @EntityScan(basePackageClasses = Supplier.class)
    @EnableJpaRepositories(basePackageClasses = SupplierRepository.class)
    @Import({
        S3ObjectStorage.class,
        SupplierImageDeletionListener.class,
        SupplierImageStorageService.class,
        SupplierMapperImpl.class,
        TimeConfig.class,
        SupplierImageService.class,
        SupplierImageProcessor.class
    })
    static class Config {}

    @Autowired
    SupplierRepository supplierRepository;

    @Autowired
    SupplierImageService supplierImageService;

    @Autowired
    SupplierImageStorageService storage;

    @Autowired
    S3Client s3;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    PlatformTransactionManager transactionManager;

    @MockitoSpyBean
    ObjectStorage objectStorage;

    @MockitoSpyBean
    DataSource dataSource;

    @Autowired
    IncompleteEventPublications publications;

    final HttpClient http = HttpClient.newHttpClient();

    Supplier owner() {
        return supplierRepository.saveAndFlush(Supplier.builder()
                .name("Image Test")
                .category(SupplierCategory.FOOD)
                .building("COM2")
                .openingHours(new ArrayList<>())
                .build());
    }

    MockMultipartFile photo() throws Exception {
        var bytes = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(40, 20, BufferedImage.TYPE_INT_RGB), "png", bytes);
        return new MockMultipartFile("file", "photo.png", "image/png", bytes.toByteArray());
    }

    String key(UUID id) {
        return supplierRepository.findById(id).orElseThrow().getImageKey();
    }

    byte[] get(String url) throws Exception {
        var response = http.send(
                HttpRequest.newBuilder(URI.create(url)).GET().build(), HttpResponse.BodyHandlers.ofByteArray());
        assertThat(response.statusCode()).isEqualTo(200);
        return response.body();
    }

    List<String> storedKeys(UUID ownerId) {
        return s3
                .listObjectsV2(ListObjectsV2Request.builder()
                        .bucket(BUCKET)
                        .prefix("supplier-images/" + ownerId + "/")
                        .build())
                .contents()
                .stream()
                .map(S3Object::key)
                .toList();
    }

    @Test
    void uploadIsProcessedAndPrivateAndDeletesReplacedAndRemovedImages() throws Exception {
        var owner = owner();
        var first = supplierImageService.uploadSupplierImage(owner.getId(), photo());
        var oldKey = key(owner.getId());
        assertThat(oldKey).startsWith("supplier-images/" + owner.getId() + "/");
        var url = first.imageUrl();
        assertThat(ImageIO.read(new ByteArrayInputStream(get(url)))).isNotNull();
        var anonymous = url.substring(0, url.indexOf('?'));
        assertThat(http.send(
                                HttpRequest.newBuilder(URI.create(anonymous))
                                        .GET()
                                        .build(),
                                HttpResponse.BodyHandlers.discarding())
                        .statusCode())
                .isEqualTo(403);
        supplierImageService.uploadSupplierImage(owner.getId(), photo());
        var newKey = key(owner.getId());
        assertThat(newKey).isNotEqualTo(oldKey);
        await().atMost(Duration.ofSeconds(10))
                .untilAsserted(() -> assertThat(storedKeys(owner.getId())).containsExactly(newKey));
        supplierImageService.removeSupplierImage(owner.getId());
        assertThat(key(owner.getId())).isNull();
        await().atMost(Duration.ofSeconds(10))
                .untilAsserted(() -> assertThat(storedKeys(owner.getId())).isEmpty());
    }

    @Test
    void lostPutResponseDeletesUploadedObjectOutsideTransaction() throws Exception {
        var owner = owner();
        var failure = new StorageException(new RuntimeException("PUT response lost"));
        doAnswer(invocation -> {
                    assertThat(TransactionSynchronizationManager.isActualTransactionActive())
                            .isFalse();
                    invocation.callRealMethod();
                    throw failure;
                })
                .when(objectStorage)
                .putObject(startsWith("supplier-images/" + owner.getId()), any(), anyString());
        doAnswer(invocation -> {
                    assertThat(TransactionSynchronizationManager.isActualTransactionActive())
                            .isFalse();
                    return invocation.callRealMethod();
                })
                .when(objectStorage)
                .deleteObject(startsWith("supplier-images/" + owner.getId()));
        try {
            assertThatThrownBy(() -> supplierImageService.uploadSupplierImage(owner.getId(), photo()))
                    .isSameAs(failure);
            assertThat(storedKeys(owner.getId())).isEmpty();
            assertThat(key(owner.getId())).isNull();
        } finally {
            reset(objectStorage);
        }
    }

    @Test
    void connectionFailureAfterPutDeletesObjectWithoutDatabaseAccess() throws Exception {
        var owner = owner();
        var connectionFailure = new SQLException("PostgreSQL unavailable");
        doAnswer(invocation -> {
                    invocation.callRealMethod();
                    doThrow(connectionFailure).when(dataSource).getConnection();
                    return null;
                })
                .when(objectStorage)
                .putObject(startsWith("supplier-images/" + owner.getId()), any(), anyString());
        doAnswer(invocation -> {
                    assertThat(TransactionSynchronizationManager.isActualTransactionActive())
                            .isFalse();
                    return invocation.callRealMethod();
                })
                .when(objectStorage)
                .deleteObject(startsWith("supplier-images/" + owner.getId()));
        try {
            assertThatThrownBy(() -> supplierImageService.uploadSupplierImage(owner.getId(), photo()))
                    .isInstanceOf(CannotCreateTransactionException.class)
                    .hasRootCause(connectionFailure);
            assertThat(storedKeys(owner.getId())).isEmpty();
            verify(objectStorage).deleteObject(startsWith("supplier-images/" + owner.getId()));
        } finally {
            doCallRealMethod().when(dataSource).getConnection();
            reset(objectStorage);
        }
        assertThat(key(owner.getId())).isNull();
    }

    @Test
    void enclosingRollbackPreservesOldImageAndDeletesNewUpload() throws Exception {
        var owner = owner();
        supplierImageService.uploadSupplierImage(owner.getId(), photo());
        var previousKey = key(owner.getId());
        var file = photo();
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            supplierImageService.uploadSupplierImage(owner.getId(), file);
            assertThat(storedKeys(owner.getId())).hasSize(2);
            status.setRollbackOnly();
        });
        assertThat(storedKeys(owner.getId())).containsExactly(previousKey);
        assertThat(key(owner.getId())).isEqualTo(previousKey);
    }

    @Test
    void invalidImagePreservesActiveImage() throws Exception {
        var owner = owner();
        supplierImageService.uploadSupplierImage(owner.getId(), photo());
        var active = key(owner.getId());
        assertThatThrownBy(() -> supplierImageService.uploadSupplierImage(
                        owner.getId(), new MockMultipartFile("file", "bad.png", "image/png", new byte[] {1, 2})))
                .isInstanceOf(SupplierImageException.class);
        assertThat(key(owner.getId())).isEqualTo(active);
        assertThat(get(storage.createPresignedUrl(active))).isNotEmpty();
    }

    @Test
    void failedDatabaseUpdatePreservesActiveImageAndDeletesNewUpload() throws Exception {
        var owner = owner();
        supplierImageService.uploadSupplierImage(owner.getId(), photo());
        var active = key(owner.getId());
        jdbc.execute("ALTER TABLE suppliers ADD CONSTRAINT test_image_failure CHECK (id != '" + owner.getId()
                + "' OR image_key IS NULL OR image_key = '" + active + "')");
        try {
            assertThatThrownBy(() -> supplierImageService.uploadSupplierImage(owner.getId(), photo()))
                    .isInstanceOf(DataAccessException.class);
        } finally {
            jdbc.execute("ALTER TABLE suppliers DROP CONSTRAINT test_image_failure");
        }
        assertThat(key(owner.getId())).isEqualTo(active);
        assertThat(get(storage.createPresignedUrl(active))).isNotEmpty();
        await().atMost(Duration.ofSeconds(10))
                .untilAsserted(() -> assertThat(storedKeys(owner.getId())).containsExactly(active));
    }

    @Test
    void deletesReplacedImageOnlyAfterCommit() throws Exception {
        var owner = owner();
        supplierImageService.uploadSupplierImage(owner.getId(), photo());
        var previousKey = key(owner.getId());
        var file = photo();
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            supplierImageService.uploadSupplierImage(owner.getId(), file);
            assertThat(storedKeys(owner.getId())).hasSize(2).contains(previousKey);
        });
        var newKey = key(owner.getId());
        assertThat(newKey).isNotEqualTo(previousKey);
        await().atMost(Duration.ofSeconds(10))
                .untilAsserted(() -> assertThat(storedKeys(owner.getId())).containsExactly(newKey));
    }

    @Test
    void persistsFailedDeletionAndRemovesPublicationAfterRetry() throws Exception {
        var owner = owner();
        supplierImageService.uploadSupplierImage(owner.getId(), photo());
        var oldKey = key(owner.getId());
        doThrow(new StorageException(new RuntimeException("S3 unavailable")))
                .when(objectStorage)
                .deleteObject(oldKey);
        supplierImageService.uploadSupplierImage(owner.getId(), photo());
        var activeKey = key(owner.getId());
        await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> assertThat(jdbc.queryForObject(
                        "SELECT count(*) FROM event_publication WHERE status = 'FAILED' AND serialized_event LIKE ?",
                        Integer.class,
                        "%" + oldKey + "%"))
                .isEqualTo(1));
        assertThat(storedKeys(owner.getId())).containsExactlyInAnyOrder(oldKey, activeKey);
        doCallRealMethod().when(objectStorage).deleteObject(oldKey);
        publications.resubmitIncompletePublications(
                publication -> publication.getEvent() instanceof SupplierImageDeletionRequestedEvent event
                        && event.key().equals(oldKey));
        await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> {
            assertThat(storedKeys(owner.getId())).containsExactly(activeKey);
            assertThat(jdbc.queryForObject(
                            "SELECT count(*) FROM event_publication WHERE serialized_event LIKE ?",
                            Integer.class,
                            "%" + oldKey + "%"))
                    .isZero();
        });
        assertThat(key(owner.getId())).isEqualTo(activeKey);
    }
}
