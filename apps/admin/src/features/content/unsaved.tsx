import { useEffect } from 'react';
import { useBlocker } from 'react-router';
import { Button } from '@/components/ui/button';
import { AlertDialog } from '@base-ui/react/alert-dialog';
import { useLeaveGuard } from '@/shared/leave-guard';
export function UnsavedGuard({
  dirty,
  saving,
  save,
  discard,
}: {
  dirty: boolean;
  saving: boolean;
  save: () => Promise<unknown>;
  discard: () => void;
}) {
  const guard = useLeaveGuard();
  useEffect(
    () => guard.register(() => dirty || saving),
    [guard, dirty, saving],
  );
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      (dirty || saving) &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  );
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    if (dirty || saving) window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, saving]);
  return (
    <AlertDialog.Root
      open={blocker.state === 'blocked'}
      onOpenChange={(open) => {
        if (!open && blocker.state === 'blocked') blocker.reset();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="dialog-backdrop" />
        <AlertDialog.Popup className="dialog">
          <AlertDialog.Title>Leave unsaved Draft?</AlertDialog.Title>
          <AlertDialog.Description>
            Local changes exist only in this tab. Save before leaving, or
            explicitly discard them.
          </AlertDialog.Description>
          <div className="toolbar">
            <Button variant="outline" onClick={() => blocker.reset?.()}>
              Stay / inspect
            </Button>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => {
                discard();
                blocker.proceed?.();
              }}
            >
              Discard and leave
            </Button>
            <Button
              disabled={saving}
              onClick={() => {
                void save()
                  .then(() => blocker.proceed?.())
                  .catch(() => blocker.reset?.());
              }}
            >
              Save and leave
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
