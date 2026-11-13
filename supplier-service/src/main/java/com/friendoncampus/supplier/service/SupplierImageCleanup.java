package com.friendoncampus.supplier.service;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.friendoncampus.supplier.storage.SupplierImageObjectStore;

@Component
public class SupplierImageCleanup {

    private static final Log LOG = LogFactory.getLog(SupplierImageCleanup.class);

    private final SupplierImageObjectStore imageStore;

    public SupplierImageCleanup(SupplierImageObjectStore imageStore) {
        this.imageStore = imageStore;
    }

    public void deleteAfterCommit(String objectKey) {
        if (objectKey == null) {
            return;
        }
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            deleteQuietly(objectKey);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                deleteQuietly(objectKey);
            }
        });
    }

    public void replaceAfterCompletion(String newObjectKey, String previousObjectKey) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            deleteQuietly(previousObjectKey);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status == STATUS_COMMITTED) {
                    deleteQuietly(previousObjectKey);
                } else {
                    deleteQuietly(newObjectKey);
                }
            }
        });
    }

    public void deleteFailedUpload(String objectKey) {
        deleteQuietly(objectKey);
    }

    private void deleteQuietly(String objectKey) {
        if (objectKey == null) {
            return;
        }
        try {
            imageStore.delete(objectKey);
        } catch (RuntimeException exception) {
            LOG.warn("Supplier image cleanup failed for object " + objectKey, exception);
        }
    }
}
