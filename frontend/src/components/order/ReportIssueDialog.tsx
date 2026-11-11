/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-02
 * Scope: Generated the requester's "Report a problem" dialog, which escalates
 *        an order to the admins (UI FR8.3.1).
 * Reviewed by Ngooi Jun Sen.
 *
 * Escalating is about this order: the admins decide who was at fault. It is
 * not reporting the courier as a person, which is the separate "Report
 * courier" action. Order marks the order Completed when the case closes and
 * does not yet act on the verdict, so the dialog promises nothing about
 * where the credits go.
 */

import { useRef, useState, type ChangeEvent } from 'react';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { TextAreaField } from '../ui/Inputs';
import { errorMessage } from '../../lib/api';
import {
  DISPUTE_TEXT_MAX_LENGTH,
  PHOTO_ACCEPT,
  PHOTO_MAX_BYTES,
  escalateOrder,
  type Order,
} from '../../lib/orders';
import styles from './ReportIssueDialog.module.css';

interface ReportIssueDialogProps {
  open: boolean;
  order: Order;
  onClose: () => void;
  /** The order as Order returns it, now Escalated. */
  onEscalated: (order: Order) => void;
}

export function ReportIssueDialog({ open, order, onClose, onEscalated }: ReportIssueDialogProps) {
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const trimmed = description.trim();
  const valid = trimmed.length > 0 && trimmed.length <= DISPUTE_TEXT_MAX_LENGTH;

  function close() {
    if (sending) return;
    setConfirming(false);
    setFailure(null);
    onClose();
  }

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null;
    // Cleared so choosing the same file again still fires a change.
    event.target.value = '';
    if (chosen === null) return;
    if (chosen.size > PHOTO_MAX_BYTES) {
      setFailure('That photo is over 10 MB. Choose a smaller one.');
      return;
    }
    setFailure(null);
    setPhoto(chosen);
  }

  async function submit() {
    if (!valid || sending) return;
    setSending(true);
    setFailure(null);
    try {
      const escalated = await escalateOrder(order.id, trimmed, photo);
      setDescription('');
      setPhoto(null);
      setConfirming(false);
      onEscalated(escalated);
    } catch (error) {
      // 409: the acknowledgement window closed, or the order moved on.
      setConfirming(false);
      setFailure(errorMessage(error, 'Could not reach the Order Service, so nothing was sent.'));
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog
      open={open}
      title="Report a problem with this order"
      onClose={close}
      footer={
        confirming ? (
          <>
            <Button variant="secondary" disabled={sending} onClick={() => setConfirming(false)}>
              Back
            </Button>
            <Button variant="danger" loading={sending} onClick={() => void submit()}>
              Escalate order
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button variant="danger" disabled={!valid} onClick={() => setConfirming(true)}>
              Continue
            </Button>
          </>
        )
      }
    >
      <div className={styles.body}>
        <p className={styles.intro}>
          For when the delivery went wrong: nothing arrived, the wrong item, or it was damaged. An
          admin looks at your description and the courier&apos;s collection and delivery photos,
          then decides who was at fault.
        </p>

        {failure ? <Alert variant="danger">{failure}</Alert> : null}

        <TextAreaField
          label="What went wrong"
          rows={5}
          maxLength={DISPUTE_TEXT_MAX_LENGTH}
          disabled={confirming}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          hint={`${trimmed.length} / ${DISPUTE_TEXT_MAX_LENGTH} characters`}
        />

        <div className={styles.photo}>
          <p className={styles.photoLabel}>Photo (optional)</p>
          {photo === null ? (
            <Button variant="secondary" disabled={confirming} onClick={() => fileInput.current?.click()}>
              Add a photo
            </Button>
          ) : (
            <div className={styles.chosen}>
              <span className={styles.fileName}>{photo.name}</span>
              <Button variant="ghost" disabled={confirming} onClick={() => setPhoto(null)}>
                Remove
              </Button>
            </div>
          )}
          <input ref={fileInput} type="file" accept={PHOTO_ACCEPT} hidden onChange={choosePhoto} />
        </div>

        {confirming ? (
          <Alert variant="warning">
            Escalating means you can no longer acknowledge this order, and it stays with the admins
            until they close the case. This cannot be withdrawn.
          </Alert>
        ) : null}
      </div>
    </Dialog>
  );
}
