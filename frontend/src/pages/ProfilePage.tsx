/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5)
 * Scope: Generated the profile page from the mockup.
 * Reviewed by Ngooi Jun Sen.
 *
 * Covers UI FR12.1.1 (name, email, credit balance), FR12.1.2 (change
 * password, through PATCH /api/v1/user/me/password), User F5.1 (delete
 * account, through DELETE /api/v1/user/me), FR12.3.1 (two columns on
 * desktop, account and credits left) and FR12.3.2 (one stacked column on
 * mobile).
 *
 * Rating card added with Claude Code (Claude Opus 5.5) on 2026-10-21: the
 * unified average from GET /api/v1/rating/{userId} (UI FR12.2.1).
 *
 * Your places card added with Claude Code (Claude Opus 5.5) on 2026-11-02:
 * Order's my-locations, with a nickname, edit and remove on each.
 *
 * Badges card added with Claude Code (Claude Opus 5.5) on 2026-11-03: GET
 * /api/v1/badges/{userId}, earned and unearned, with progress (Badges F4).
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { ConfirmDialog, Dialog } from '../components/ui/Dialog';
import { Icon } from '../components/ui/Icon';
import { PasswordRules } from '../components/ui/PasswordRules';
import { TextField } from '../components/ui/TextField';
import { TextAreaField } from '../components/ui/Inputs';
import { errorMessage } from '../lib/api';
import { avatarColours } from '../lib/avatar';
import {
  deleteDeliveryPoint,
  deliveryPointLabel,
  fetchMyDeliveryPoints,
  updateDeliveryPoint,
  type DeliveryPoint,
  type DeliveryPointChanges,
} from '../lib/deliveryPoints';
import { changePassword, deleteAccount } from '../lib/user';
import { checkPasswordRules, isValidPassword } from '../lib/validation';
import { useCreditBalance } from '../lib/credit';
import { formatRating, initials } from '../lib/format';
import { fetchUserRating, type UserRating } from '../lib/rating';
import { fetchMyBadges, type BadgeRole, type UserBadges } from '../lib/badges';
import styles from './ProfilePage.module.css';

export function ProfilePage() {
  const { user, signOut } = useAuth();
  const creditBalance = useCreditBalance();
  const navigate = useNavigate();

  const [changingPassword, setChangingPassword] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setFailure(null);
    setNotice(null);
    try {
      await deleteAccount();
      setConfirmingDelete(false);
      await signOut();
      navigate('/login', { replace: true });
    } catch (error) {
      // The service's reason is shown as given - for example refusing the
      // last admin (D2 Part 1 point 6) - rather than a generic failure.
      setConfirmingDelete(false);
      setFailure(errorMessage(error, 'Could not reach the server. Try again in a moment.'));
    } finally {
      setDeleting(false);
    }
  }

  if (user === null) return null;

  return (
    <div className={styles.page}>
      <div className={styles.columns}>
        <div className={styles.column}>
          <section className={styles.card}>
            <div className={styles.identity}>
              <span className={styles.avatar} style={avatarColours(user.userId)} aria-hidden="true">
                {initials(user.name)}
              </span>
              <div className={styles.identityText}>
                <h1 className={styles.name}>{user.name}</h1>
                <p className={styles.email}>
                  {user.email}
                  {user.status === 'Verified' ? (
                    <span className={styles.verified}>
                      <Icon name="check" size={14} />
                      Verified
                    </span>
                  ) : (
                    <span className={styles.unverified}>{user.status}</span>
                  )}
                </p>
              </div>
            </div>

            <div className={styles.divider} />

            {/*
              D2 Part 1 point 5: there is no form for name or email because
              the contract has no endpoint for either (User F3.2/F3.5), and
              role, status and user id are never sent from the client. The
              server enforces that; this line only says so.
            */}
            <p className={styles.rowNote}>
              Your name and email are fixed once your account is created.
            </p>

            <div className={styles.divider} />

            {notice ? <Alert variant="success">{notice}</Alert> : null}
            {failure ? <Alert variant="danger">{failure}</Alert> : null}

            <div className={styles.passwordRow}>
              <div>
                <p className={styles.rowLabel}>Password</p>
                {/*
                  The mockup shows "Last changed 3 months ago". Nothing
                  returns that: the contract's /user/me is name, email and
                  status. Left out rather than invented.
                */}
                <p className={styles.rowNote}>Change it whenever you like</p>
              </div>
              <Button variant="secondary" onClick={() => setChangingPassword(true)}>
                Change password
              </Button>
            </div>

            <div className={styles.divider} />

            <div className={styles.passwordRow}>
              <div>
                <p className={styles.rowLabel}>Delete account</p>
                <p className={styles.rowNote}>Removed for good after six months</p>
              </div>
              <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
                Delete
              </Button>
            </div>
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Credit balance</h2>

            <p className={styles.balance}>
              <span className={styles.balanceNumber}>{creditBalance ?? '--'}</span>
              <span className={styles.balanceNote}>
                {creditBalance === null ? 'balance unavailable' : 'available'}
                {/* TODO(credit): "· N reserved" - the balance endpoint returns
                    the available figure only. */}
              </span>
            </p>

            {/*
              TODO(credit): the mockup's breakdown (earned as a courier, spent
              as a requester, granted at signup) and the credit history button
              need GET /api/v1/credit/me/ledger, which is in the contract but
              not implemented.

            <p className={styles.breakdown}>
              Earned {earnedAsCourier} as a courier &middot; spent {spentAsRequester} as a
              requester &middot; {grantedAtSignup} granted at signup.
            </p>
            <Button variant="secondary" fullWidth>View credit history</Button>
            */}
          </section>

          <PlacesCard />
        </div>

        <div className={styles.column}>
          <RatingCard userId={user.userId} />

          <BadgesCard userId={user.userId} />
        </div>
      </div>

      <ChangePasswordDialog
        open={changingPassword}
        onClose={() => setChangingPassword(false)}
        onChanged={() => {
          setChangingPassword(false);
          setFailure(null);
          setNotice('Password changed.');
        }}
      />

      {/* NFR9.1.1: irreversible actions ask first. */}
      <ConfirmDialog
        open={confirmingDelete}
        title="Delete your account?"
        consequence={
          <>
            Your account is marked for deletion and removed for good after six months.
            You are signed out now. If you are the only admin, the service may refuse, since
            nobody would be left to run the platform.
          </>
        }
        confirmLabel="Delete account"
        destructive
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}

/**
 * UI FR12.2.1, adjusted to the team's choice of one unified average (Rating
 * F1): everything the user has been rated, as courier or requester, with the
 * count behind it (Rating F3.1.1), since a bare average misleads at low volume.
 */
function RatingCard({ userId }: { userId: string }) {
  const [rating, setRating] = useState<UserRating | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchUserRating(userId)
      .then((result) => {
        if (!cancelled) setRating(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Rating</h2>

      {failed ? (
        <p className={styles.rowNote}>Your rating could not be loaded. Try again later.</p>
      ) : rating === null ? (
        <p className={styles.rowNote}>Loading…</p>
      ) : rating.average === null ? (
        // FR20.2.2: an explicit empty state.
        <p className={styles.rowNote}>
          No ratings yet. You are rated after each delivery, as a courier or as a requester.
        </p>
      ) : (
        <p className={styles.balance}>
          <span className={styles.balanceNumber}>
            {formatRating(rating.average)}
            <span className={styles.ratingStar}>
              <Icon name="star" size={26} filled />
            </span>
          </span>
          <span className={styles.balanceNote}>
            from {rating.count} {rating.count === 1 ? 'rating' : 'ratings'}, as courier and requester
          </span>
        </p>
      )}
    </section>
  );
}

/*
 * Placeholder art until the catalogue's icons exist: the service names SVGs
 * under /badges/ that the frontend does not have yet, so each badge gets a
 * medallion by role instead (bag for courier, pin for requester, star for
 * either), greyed with a lock until earned.
 */
const BADGE_ICONS: Record<BadgeRole, 'bag' | 'pin' | 'star'> = {
  courier: 'bag',
  requester: 'pin',
  any: 'star',
};

const BADGE_TONES: Record<BadgeRole, string> = {
  courier: styles.badgeCourier,
  requester: styles.badgeRequester,
  any: styles.badgeAny,
};

const earnedDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** Badges F4: every badge, earned or not, with what unlocks it and how close the user is. */
function BadgesCard({ userId }: { userId: string }) {
  const [badges, setBadges] = useState<UserBadges | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMyBadges(userId)
      .then((result) => {
        if (!cancelled) setBadges(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <section className={styles.card}>
      <div className={styles.soonHead}>
        <h2 className={styles.cardTitle}>Badges</h2>
        {badges !== null ? (
          <span className={styles.soonTag}>
            {badges.earnedCount} of {badges.totalCount} earned
          </span>
        ) : null}
      </div>

      {failed ? (
        <p className={styles.rowNote}>Your badges could not be loaded. Try again later.</p>
      ) : badges === null ? (
        <p className={styles.rowNote}>Loading…</p>
      ) : (
        <ul className={styles.badges}>
          {badges.badges.map((badge) => (
            <li key={badge.badgeId} className={styles.badge}>
              <span
                className={`${styles.medallion} ${badge.earned ? BADGE_TONES[badge.targetRole] : styles.badgeLocked}`}
                aria-hidden="true"
              >
                <Icon name={BADGE_ICONS[badge.targetRole]} size={22} />
                {badge.earned ? null : (
                  <span className={styles.medallionLock}>
                    <Icon name="lock" size={12} />
                  </span>
                )}
              </span>
              <div className={styles.badgeText}>
                <p className={styles.rowLabel}>
                  {badge.title}
                  <span className="visually-hidden">{badge.earned ? ', earned' : ', not earned yet'}</span>
                </p>
                <p className={styles.rowNote}>{badge.description}</p>
                {badge.earned ? (
                  badge.earnedAt !== null ? (
                    <p className={styles.badgeEarned}>Earned {earnedDate.format(badge.earnedAt)}</p>
                  ) : null
                ) : badge.progress !== null ? (
                  <BadgeProgress current={badge.progress.current} target={badge.progress.target} />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BadgeProgress({ current, target }: { current: number; target: number }) {
  const shown = Math.min(current, target);
  return (
    <div className={styles.badgeProgress}>
      <progress className={styles.progressBar} value={shown} max={target} />
      <span className={styles.progressCount}>
        {shown} / {target}
      </span>
    </div>
  );
}

/**
 * User F3.7. Same rules and strength indicator as sign-up (User F1.2), so a
 * password that sign-up would refuse cannot be set here either.
 */
function ChangePasswordDialog({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const rules = checkPasswordRules(password);
  const confirmOk = confirmPassword.length > 0 && confirmPassword === password;
  const canSave = isValidPassword(password) && confirmOk && !saving;

  function close() {
    setPassword('');
    setConfirmPassword('');
    setFailure(null);
    onClose();
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setFailure(null);
    try {
      await changePassword(password);
      setPassword('');
      setConfirmPassword('');
      onChanged();
    } catch (error) {
      setFailure(errorMessage(error, 'Could not reach the server. Try again in a moment.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      title="Change password"
      onClose={saving ? () => undefined : close}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button disabled={!canSave} loading={saving} onClick={save}>
            Save password
          </Button>
        </>
      }
    >
      {failure ? <Alert variant="danger">{failure}</Alert> : null}
      <TextField
        label="New password"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      >
        {password.length > 0 ? <PasswordRules rules={rules} /> : null}
      </TextField>
      <TextField
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        error={confirmPassword.length > 0 && !confirmOk ? 'Passwords do not match' : null}
      />
    </Dialog>
  );
}

/**
 * Order adds a place here only when an order to it succeeds; there is no way
 * to save one in advance, so the empty state says how places get here.
 */
function PlacesCard() {
  const [places, setPlaces] = useState<DeliveryPoint[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<DeliveryPoint | null>(null);
  const [removing, setRemoving] = useState<DeliveryPoint | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyDeliveryPoints()
      .then((result) => {
        if (!cancelled) setPlaces(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRemove() {
    if (removing === null) return;
    setBusy(true);
    setFailure(null);
    try {
      await deleteDeliveryPoint(removing.id);
      setPlaces((current) => current?.filter((place) => place.id !== removing.id) ?? null);
      setRemoving(null);
    } catch (error) {
      setRemoving(null);
      setFailure(errorMessage(error, 'Could not reach the Order Service, so nothing was removed.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Your places</h2>

      {failure ? <Alert variant="danger">{failure}</Alert> : null}

      {failed ? (
        <p className={styles.rowNote}>Your places could not be loaded. Try again later.</p>
      ) : places === null ? (
        <p className={styles.rowNote}>Loading…</p>
      ) : places.length === 0 ? (
        <p className={styles.rowNote}>
          None yet. A drop-off point is saved here after a request to it posts, and you can then
          give it a nickname.
        </p>
      ) : (
        <ul className={styles.places}>
          {places.map((place) => (
            <li key={place.id} className={styles.place}>
              {/* Same colour code as the delivery picker: blue for shared spots around campus. */}
              <span
                className={`${styles.placeSwatch} ${place.code === null ? styles.placeOwn : styles.placeShared}`}
                title={place.code === null ? 'A place you made' : 'A spot around campus'}
                aria-hidden="true"
              />
              <div className={styles.placeText}>
                <p className={styles.rowLabel}>
                  {deliveryPointLabel(place)}
                  <span className="visually-hidden">
                    {place.code === null ? ', a place you made' : ', a spot around campus'}
                  </span>
                </p>
                <p className={styles.rowNote}>
                  {[place.building, place.description].filter((part) => part && part.trim() !== '').join(' · ')}
                  {place.useCount !== null
                    ? ` · used ${place.useCount} ${place.useCount === 1 ? 'time' : 'times'}`
                    : ''}
                </p>
              </div>
              <div className={styles.placeActions}>
                <Button variant="secondary" onClick={() => setEditing(place)}>
                  Edit
                </Button>
                <Button variant="ghost" onClick={() => setRemoving(place)}>
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing !== null ? (
        <EditPlaceDialog
          key={editing.id}
          place={editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            // A copy comes back with a new id; it replaces the row it came from.
            const replacedId = editing.id;
            setPlaces((current) => current?.map((place) => (place.id === replacedId ? saved : place)) ?? null);
            setEditing(null);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={removing !== null}
        title={removing === null ? 'Remove place?' : `Remove ${deliveryPointLabel(removing)}?`}
        consequence={
          <>
            It comes off your list and its nickname is lost. Past requests to it are not changed.
            {removing !== null && removing.code !== null ? ' Everyone else can still pick it.' : ''}
          </>
        }
        confirmLabel="Remove"
        destructive
        busy={busy}
        onConfirm={() => void handleRemove()}
        onCancel={() => setRemoving(null)}
      />
    </section>
  );
}

function EditPlaceDialog({
  place,
  onClose,
  onSaved,
}: {
  place: DeliveryPoint;
  onClose: () => void;
  onSaved: (place: DeliveryPoint) => void;
}) {
  const original = {
    nickname: place.nickname ?? '',
    name: place.name,
    building: place.building ?? '',
    description: place.description ?? '',
  };
  const [nickname, setNickname] = useState(original.nickname);
  const [name, setName] = useState(original.name);
  const [building, setBuilding] = useState(original.building);
  const [description, setDescription] = useState(original.description);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // Only what changed is sent: a nickname alone never makes Order copy the place.
  const changes: DeliveryPointChanges = {};
  if (nickname.trim() !== original.nickname) changes.nickname = nickname.trim();
  if (name.trim() !== original.name) changes.name = name.trim();
  if (building.trim() !== original.building) changes.building = building.trim();
  if (description.trim() !== original.description) changes.description = description.trim();

  const errors = {
    name: name.trim() === '' ? 'Give it a name' : null,
    building: building.trim() === '' ? 'Say which building or block' : null,
    description: description.trim() === '' ? 'Say how the courier finds it' : null,
  };
  const placeChanged = 'name' in changes || 'building' in changes || 'description' in changes;
  const canSave = Object.keys(changes).length > 0 && Object.values(errors).every((error) => error === null);

  async function save() {
    if (!canSave || saving) return;
    setSaving(true);
    setFailure(null);
    try {
      onSaved(await updateDeliveryPoint(place.id, changes));
    } catch (error) {
      setFailure(errorMessage(error, 'Could not reach the Order Service, so nothing was changed.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      title={`Edit ${deliveryPointLabel(place)}`}
      onClose={saving ? () => undefined : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button disabled={!canSave} loading={saving} onClick={() => void save()}>
            Save changes
          </Button>
        </>
      }
    >
      {failure ? <Alert variant="danger">{failure}</Alert> : null}
      <TextField
        label="Nickname"
        name="nickname"
        placeholder="Home"
        maxLength={80}
        value={nickname}
        onChange={(event) => setNickname(event.target.value)}
        hint="Only you see this. Couriers see the name and details below."
      />
      <TextField
        label="Name"
        name="name"
        maxLength={200}
        value={name}
        onChange={(event) => setName(event.target.value)}
        error={errors.name}
      />
      <TextField
        label="Building"
        name="building"
        maxLength={200}
        value={building}
        onChange={(event) => setBuilding(event.target.value)}
        error={errors.building}
      />
      <TextAreaField
        label="Where exactly"
        maxLength={500}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        error={errors.description}
        hint={
          place.code !== null && placeChanged
            ? 'Everyone can pick this spot, so your changes are saved as your own copy and the original stays as it is.'
            : 'Changes apply to new requests. Past requests keep what they were posted with.'
        }
      />
    </Dialog>
  );
}
