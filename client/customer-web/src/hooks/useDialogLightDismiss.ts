import { useEffect, type RefObject } from 'react';

/**
 * Light-dismiss fallback for browsers without native `<dialog closedby="any">` support (e.g. Safari).
 */
export function useDialogLightDismiss(dialogRef: RefObject<HTMLDialogElement | null>): void {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || 'closedBy' in HTMLDialogElement.prototype) {
      return;
    }

    const isOutside = (event: PointerEvent): boolean => {
      const rect = dialog.getBoundingClientRect();
      return (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      );
    };

    let pressedOutside = false;
    const handlePointerDown = (event: PointerEvent): void => {
      pressedOutside = isOutside(event);
    };
    const handlePointerUp = (event: PointerEvent): void => {
      if (pressedOutside && isOutside(event)) {
        dialog.close();
      }
      pressedOutside = false;
    };

    dialog.addEventListener('pointerdown', handlePointerDown);
    dialog.addEventListener('pointerup', handlePointerUp);
    return () => {
      dialog.removeEventListener('pointerdown', handlePointerDown);
      dialog.removeEventListener('pointerup', handlePointerUp);
    };
  }, [dialogRef]);
}
