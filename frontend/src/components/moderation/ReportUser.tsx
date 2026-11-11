/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5)
 * Scope: Generated the "Report" link and form on the order and task pages.
 * Reviewed by Ngooi Jun Sen.
 *
 * Users never see each other's IDs, so a report is filed from an order, about
 * the other person on it: the requester reports the courier, the courier the
 * requester. The User Service takes the reporter from the session and passes
 * the report on to the Admin Service.
 */

import { useState } from 'react';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { TextAreaField } from '../ui/Inputs';
import { ApiError, errorMessage } from '../../lib/api';
import { reportUser, SUPPORT_TEXT_MAX_LENGTH } from '../../lib/moderation';
import styles from './ReportUser.module.css';

interface ReportUserProps {
  userId: string;
  /** Who they are on this order, e.g. "courier". Orders carry no names. */
  role: string;
}

export function ReportUser({ userId, role }: ReportUserProps) {
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const trimmed = comment.trim();
  const valid = trimmed.length > 0 && trimmed.length <= SUPPORT_TEXT_MAX_LENGTH;

  function close() {
    if (sending) return;
    setOpen(false);
    setFailure(null);
  }

  async function submit() {
    if (!valid || sending) return;
    setSending(true);
    setFailure(null);
    try {
      // A repeat while an earlier report is still open returns that report,
      // so a double submit cannot file two.
      await reportUser(userId, trimmed);
      setSent(true);
      setOpen(false);
      setComment('');
    } catch (error) {
      setFailure(
        error instanceof ApiError && error.code === 'USER_NOT_FOUND'
          ? `This ${role}'s account no longer exists.`
          : errorMessage(error, 'Could not reach the server, so the report was not sent.'),
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={styles.report}>
      {sent ? (
        <p className={styles.sent} role="status">
          Report sent. An admin will review it; you will not be told the outcome.
        </p>
      ) : (
        <Button variant="ghost" onClick={() => setOpen(true)}>
          Report {role}
        </Button>
      )}

      <Dialog
        open={open}
        title={`Report this ${role}`}
        onClose={close}
        footer={
          <>
            <Button variant="secondary" disabled={sending} onClick={close}>
              Cancel
            </Button>
            <Button variant="danger" disabled={!valid} loading={sending} onClick={() => void submit()}>
              Send report
            </Button>
          </>
        }
      >
        <div className={styles.body}>
          <p className={styles.intro}>
            Tell the admins what happened. They see your name, the {role}&apos;s, and what you
            write here. The {role} is not told who reported them.
          </p>
          {failure ? <Alert variant="danger">{failure}</Alert> : null}
          <TextAreaField
            label="What happened"
            rows={5}
            maxLength={SUPPORT_TEXT_MAX_LENGTH}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            hint={`${trimmed.length} / ${SUPPORT_TEXT_MAX_LENGTH} characters`}
          />
        </div>
      </Dialog>
    </div>
  );
}
