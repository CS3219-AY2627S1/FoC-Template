/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), dates: 2026-09-26 to 2026-11-10
 * Scope: Generated service tests for category creation, listing, and administration.
 */
package com.campuscouriers.supplier.service;

import com.campuscouriers.supplier.dto.CreateCategoryRequest;
import com.campuscouriers.supplier.entity.Category;
import com.campuscouriers.supplier.entity.CategoryStatus;
import com.campuscouriers.supplier.entity.SupplierStatus;
import com.campuscouriers.supplier.exception.DuplicateCategoryException;
import com.campuscouriers.supplier.exception.ActiveSuppliersAssignedException;
import com.campuscouriers.supplier.repository.CategoryRepository;
import com.campuscouriers.supplier.repository.SupplierRepository;
import com.campuscouriers.supplier.dto.UpdateCategoryRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@ExtendWith(MockitoExtension.class)
class CategoryServiceTest {

    @Mock
    private CategoryRepository categoryRepository;

    @Mock
    private SupplierRepository supplierRepository;

    @InjectMocks
    private CategoryService categoryService;

    @Test
    void findActive_returnsRepositoryResultsInResponse() {
        when(categoryRepository.findAllByStatusOrderByNormalizedNameAsc(CategoryStatus.ACTIVE))
                .thenReturn(List.of(new Category("Food", "food")));

        var response = categoryService.findActive();

        assertThat(response.items()).extracting(item -> item.name()).containsExactly("Food");
    }

    @Test
    void findDeactivated_returnsOnlyRetiredRepositoryResults() {
        Category category = new Category("Old Food", "old food");
        category.deactivate();
        when(categoryRepository.findAllByStatusOrderByNormalizedNameAsc(CategoryStatus.RETIRED))
                .thenReturn(List.of(category));

        var response = categoryService.findDeactivated();

        assertThat(response.items()).extracting(item -> item.status())
                .containsExactly(CategoryStatus.RETIRED);
    }

    @Test
    void create_trimsAndNormalizesNameAndDefaultsToActive() {
        when(categoryRepository.saveAndFlush(any(Category.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        var response = categoryService.create(new CreateCategoryRequest("  Food   and Drinks  "));

        ArgumentCaptor<Category> captor = ArgumentCaptor.forClass(Category.class);
        verify(categoryRepository).existsByNormalizedName("food and drinks");
        verify(categoryRepository).saveAndFlush(captor.capture());
        assertThat(captor.getValue().getName()).isEqualTo("Food and Drinks");
        assertThat(captor.getValue().getNormalizedName()).isEqualTo("food and drinks");
        assertThat(response.name()).isEqualTo("Food and Drinks");
        assertThat(response.status()).isEqualTo(CategoryStatus.ACTIVE);
    }

    @Test
    void create_whenNormalizedNameExists_throwsAndDoesNotSave() {
        when(categoryRepository.existsByNormalizedName("food")).thenReturn(true);

        assertThatThrownBy(() -> categoryService.create(new CreateCategoryRequest(" FOOD ")))
                .isInstanceOf(DuplicateCategoryException.class);

        verify(categoryRepository, never()).saveAndFlush(any());
    }

    @Test
    void update_renamesReferencedCategoryUsingCreationRules() {
        UUID id = UUID.randomUUID();
        Category category = new Category("Food", "food");
        when(categoryRepository.findById(id)).thenReturn(Optional.of(category));
        when(categoryRepository.saveAndFlush(category)).thenReturn(category);

        var response = categoryService.update(id, new UpdateCategoryRequest(" Food   and Drinks "));

        verify(categoryRepository).existsByNormalizedNameAndIdNot("food and drinks", id);
        assertThat(response.name()).isEqualTo("Food and Drinks");
    }

    @Test
    void deactivate_whenActiveSupplierIsAssigned_returnsConflictAndDoesNotSave() {
        UUID id = UUID.randomUUID();
        Category category = new Category("Food", "food");
        when(categoryRepository.findById(id)).thenReturn(Optional.of(category));
        when(supplierRepository.existsByCategoryIdAndStatus(id, SupplierStatus.ACTIVE)).thenReturn(true);

        assertThatThrownBy(() -> categoryService.deactivate(id))
                .isInstanceOf(ActiveSuppliersAssignedException.class);

        assertThat(category.getStatus()).isEqualTo(CategoryStatus.ACTIVE);
        verify(categoryRepository, never()).saveAndFlush(any());
    }

    @Test
    void deactivateAndReactivate_whenNoActiveSupplier_changesStatus() {
        UUID id = UUID.randomUUID();
        Category category = new Category("Food", "food");
        when(categoryRepository.findById(id)).thenReturn(Optional.of(category));
        when(categoryRepository.saveAndFlush(category)).thenReturn(category);

        assertThat(categoryService.deactivate(id).status()).isEqualTo(CategoryStatus.RETIRED);
        assertThat(categoryService.reactivate(id).status()).isEqualTo(CategoryStatus.ACTIVE);
    }
}
