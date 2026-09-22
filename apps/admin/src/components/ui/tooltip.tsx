import { Tooltip as Primitive } from '@base-ui/react/tooltip';
import type { ReactElement, ReactNode } from 'react';
export function Tooltip({
  children,
  label,
}: {
  children: ReactElement;
  label: ReactNode;
}) {
  return (
    <Primitive.Root>
      <Primitive.Trigger render={children} />
      <Primitive.Portal>
        <Primitive.Positioner
          side="right"
          sideOffset={8}
          className="tooltip-positioner"
        >
          <Primitive.Popup className="ui-tooltip">{label}</Primitive.Popup>
        </Primitive.Positioner>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
export const TooltipProvider = Primitive.Provider;
