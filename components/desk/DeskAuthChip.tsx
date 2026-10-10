'use client';

import { useDeskAuth } from '@/components/auth/AuthProvider';
import scene from './DeskScene.module.css';

/**
 * The desk's account affordance — Sign in while anonymous, the signed-in
 * chip (with Hetty's paper-import actions) once an account is live. Shared
 * by DeskRoom (compact) and RoomPresentation (room) so the way into an
 * account does not change when the view does. Renders nothing where the
 * optional account tier is not configured.
 */
export function DeskAuthChip({
  showPaperImport = false,
  anonymousCount = 0,
  importStatus = 'idle',
  onImportAnonymous,
}: {
  showPaperImport?: boolean;
  anonymousCount?: number;
  importStatus?: 'idle' | 'pending' | 'done' | 'failed';
  onImportAnonymous?: () => void;
}) {
  const auth = useDeskAuth();
  if (!auth.enabled) return null;
  if (!auth.authenticated) {
    return (
      <button
        type="button"
        className={scene.authLink}
        onClick={auth.login}
        title={showPaperImport
          ? "Optional. Keeps your paper record and Hetty's saved lines on your account instead of only this browser."
          : 'Optional account sign-in. Jesse paper records stay in this browser.'}
      >
        {showPaperImport ? 'Sign in to keep your record' : 'Sign in'}
      </button>
    );
  }
  return (
    <span className={scene.authChip}>
      <span className={scene.authLabel} title={auth.label ?? 'Signed in'}>{auth.label ?? 'Signed in'}</span>
      {showPaperImport && anonymousCount > 0 && onImportAnonymous && (
        <button
          type="button"
          className={scene.authLink}
          disabled={importStatus === 'pending'}
          onClick={() => { void onImportAnonymous(); }}
          title={`Import ${anonymousCount} paper ${anonymousCount === 1 ? 'record' : 'records'} left on this browser before you signed in`}
        >
          {importStatus === 'pending'
            ? 'Importing…'
            : `Import ${anonymousCount} paper ${anonymousCount === 1 ? 'record' : 'records'}`}
        </button>
      )}
      {showPaperImport && anonymousCount === 0 && importStatus === 'failed' && onImportAnonymous && (
        <button type="button" className={scene.authLink} onClick={() => { void onImportAnonymous(); }}>
          Retry import
        </button>
      )}
      {showPaperImport && anonymousCount === 0 && importStatus === 'done' && (
        <span className={scene.authLabel} role="status">Imported</span>
      )}
      <button type="button" onClick={auth.logout}>Sign out</button>
    </span>
  );
}
