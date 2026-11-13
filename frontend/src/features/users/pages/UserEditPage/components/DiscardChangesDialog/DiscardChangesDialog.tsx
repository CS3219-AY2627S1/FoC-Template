import { AlertDialog } from '@base-ui/react/alert-dialog'
import { Button } from '@base-ui/react/button'
import styles from './DiscardChangesDialog.module.scss'

type DiscardChangesDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirmDiscard: () => void
}

export const DiscardChangesDialog = ({
  open,
  onOpenChange,
  onConfirmDiscard,
}: DiscardChangesDialogProps) => (
  <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
    <AlertDialog.Portal>
      <AlertDialog.Backdrop className={styles.backdrop} />
      <AlertDialog.Popup className={styles.dialog}>
        <AlertDialog.Title className={styles.dialogTitle}>
          Discard unsaved changes?
        </AlertDialog.Title>
        <AlertDialog.Description className={styles.muted}>
          Your changes to this user will be lost.
        </AlertDialog.Description>
        <div className={styles.dialogActions}>
          <AlertDialog.Close type="button" className={styles.button}>
            Keep editing
          </AlertDialog.Close>
          <Button
            type="button"
            className={`${styles.button} ${styles.discard}`}
            onClick={onConfirmDiscard}
          >
            Discard changes
          </Button>
        </div>
      </AlertDialog.Popup>
    </AlertDialog.Portal>
  </AlertDialog.Root>
)
