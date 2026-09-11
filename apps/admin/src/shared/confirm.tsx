import { AlertDialog } from '@base-ui/react/alert-dialog';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Button } from '@/components/ui/button';
type Request = { title: string; description: string; confirm?: string };
type Ask = (request: Request) => Promise<boolean>;
const Context = createContext<Ask | null>(null);
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);
  const pending = useRef<((value: boolean) => void) | null>(null);
  const finish = (value: boolean) => {
    pending.current?.(value);
    pending.current = null;
    setRequest(null);
  };
  useEffect(() => () => pending.current?.(false), []);
  const ask: Ask = (request) =>
    new Promise((resolve) => {
      pending.current?.(false);
      pending.current = resolve;
      setRequest(request);
    });
  return (
    <Context value={ask}>
      {children}
      <AlertDialog.Root
        open={!!request}
        onOpenChange={(open) => {
          if (!open) finish(false);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="dialog-backdrop" />
          <AlertDialog.Popup className="dialog">
            <AlertDialog.Title>{request?.title}</AlertDialog.Title>
            <AlertDialog.Description>
              {request?.description}
            </AlertDialog.Description>
            <div className="toolbar">
              <Button variant="outline" onClick={() => finish(false)}>
                Cancel
              </Button>
              <Button onClick={() => finish(true)}>
                {request?.confirm ?? 'Confirm'}
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </Context>
  );
}
export function useConfirm() {
  const value = useContext(Context);
  if (!value) throw new Error('Confirmation provider missing');
  return value;
}
