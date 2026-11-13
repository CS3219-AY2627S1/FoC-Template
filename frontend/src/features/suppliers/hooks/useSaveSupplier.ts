import { Toast } from '@base-ui/react/toast'
import { getErrorMessage } from '../utils/supplierFormat'
import { useApplySupplierImageChange } from './useSuppliers'
import { useBackToSupplierList } from './useBackToSupplierList'
import type { Supplier, SupplierImageChange } from '../types/supplier.types'

// save the changes for supplier info
export const useSaveSupplier = (verb: 'added' | 'updated') => {
  const toast = Toast.useToastManager()
  const applyImageChange = useApplySupplierImageChange()
  const backToList = useBackToSupplierList()

  const save = async (
    saveSupplier: () => Promise<Supplier>,
    image: SupplierImageChange,
  ) => {
    let saved: Supplier
    try {
      saved = await saveSupplier()
    } catch (error) {
      toast.add({ type: 'error', title: getErrorMessage(error) })
      return
    }
    try {
      await applyImageChange.mutateAsync({ id: saved.id, change: image })
      toast.add({ type: 'success', title: `${saved.name} was ${verb}.` })
    } catch (error) {
      toast.add({
        type: 'warning',
        title: `${saved.name} was ${verb}, but the image was not saved.`,
        description: getErrorMessage(error),
      })
    }
    backToList()
  }

  return { save, savingImage: applyImageChange.isPending }
}
