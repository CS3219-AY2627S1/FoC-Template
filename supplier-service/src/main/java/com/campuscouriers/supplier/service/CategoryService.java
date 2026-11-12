/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), dates: 2026-09-26 to 2026-11-10
 * Scope: Generated category creation, listing, update, and lifecycle operations.
 */
package com.campuscouriers.supplier.service;

import com.campuscouriers.supplier.dto.CategoryResponse;
import com.campuscouriers.supplier.dto.CreateCategoryRequest;
import com.campuscouriers.supplier.dto.ItemListResponse;
import com.campuscouriers.supplier.dto.UpdateCategoryRequest;
import com.campuscouriers.supplier.entity.Category;
import com.campuscouriers.supplier.entity.CategoryStatus;
import com.campuscouriers.supplier.exception.DuplicateCategoryException;
import com.campuscouriers.supplier.exception.ActiveSuppliersAssignedException;
import com.campuscouriers.supplier.exception.ReferenceNotFoundException;
import com.campuscouriers.supplier.repository.CategoryRepository;
import com.campuscouriers.supplier.repository.SupplierRepository;
import com.campuscouriers.supplier.entity.SupplierStatus;
import com.campuscouriers.supplier.util.NameNormalizer;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CategoryService {

    private final CategoryRepository categoryRepository;
    private final SupplierRepository supplierRepository;

    public CategoryService(CategoryRepository categoryRepository, SupplierRepository supplierRepository) {
        this.categoryRepository = categoryRepository;
        this.supplierRepository = supplierRepository;
    }

    @Transactional
    public CategoryResponse create(CreateCategoryRequest request) {
        String displayName = NameNormalizer.displayName(request.name());
        String normalizedName = NameNormalizer.normalizedName(displayName);

        if (categoryRepository.existsByNormalizedName(normalizedName)) {
            throw new DuplicateCategoryException(displayName);
        }

        try {
            Category category = categoryRepository.saveAndFlush(new Category(displayName, normalizedName));
            return CategoryResponse.from(category);
        } catch (DataIntegrityViolationException exception) {
            throw new DuplicateCategoryException(displayName);
        }
    }

    @Transactional(readOnly = true)
    public ItemListResponse<CategoryResponse> findActive() {
        return new ItemListResponse<>(categoryRepository
                .findAllByStatusOrderByNormalizedNameAsc(CategoryStatus.ACTIVE)
                .stream()
                .map(CategoryResponse::from)
                .toList());
    }

    @Transactional(readOnly = true)
    public ItemListResponse<CategoryResponse> findDeactivated() {
        return new ItemListResponse<>(categoryRepository
                .findAllByStatusOrderByNormalizedNameAsc(CategoryStatus.RETIRED)
                .stream()
                .map(CategoryResponse::from)
                .toList());
    }

    @Transactional(readOnly = true)
    public CategoryResponse findById(java.util.UUID id) {
        return CategoryResponse.from(findCategory(id));
    }

    @Transactional
    public CategoryResponse update(java.util.UUID id, UpdateCategoryRequest request) {
        Category category = findCategory(id);
        String displayName = NameNormalizer.displayName(request.name());
        String normalizedName = NameNormalizer.normalizedName(displayName);
        if (categoryRepository.existsByNormalizedNameAndIdNot(normalizedName, id)) {
            throw new DuplicateCategoryException(displayName);
        }
        category.rename(displayName, normalizedName);
        try {
            return CategoryResponse.from(categoryRepository.saveAndFlush(category));
        } catch (DataIntegrityViolationException exception) {
            throw new DuplicateCategoryException(displayName);
        }
    }

    @Transactional
    public CategoryResponse deactivate(java.util.UUID id) {
        Category category = findCategory(id);
        if (supplierRepository.existsByCategoryIdAndStatus(id, SupplierStatus.ACTIVE)) {
            throw new ActiveSuppliersAssignedException("Category");
        }
        category.deactivate();
        return CategoryResponse.from(categoryRepository.saveAndFlush(category));
    }

    @Transactional
    public CategoryResponse reactivate(java.util.UUID id) {
        Category category = findCategory(id);
        category.reactivate();
        return CategoryResponse.from(categoryRepository.saveAndFlush(category));
    }

    private Category findCategory(java.util.UUID id) {
        return categoryRepository.findById(id)
                .orElseThrow(() -> new ReferenceNotFoundException("Category", id));
    }
}
