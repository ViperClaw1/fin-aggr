'use client';

import { config } from '@fortawesome/fontawesome-svg-core';
import { faCheck } from '@fortawesome/free-solid-svg-icons/faCheck';
import { faXmark } from '@fortawesome/free-solid-svg-icons/faXmark';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

config.autoAddCss = false;

/** Own chunk: the icons render only after client-side ranking, so they stay out of the first load (AC-8). */
export function FitMark({ fit }: { fit: boolean }) {
  return (
    <span className={fit ? 'text-primary' : 'text-danger'}>
      <FontAwesomeIcon icon={fit ? faCheck : faXmark} className="size-4" />
      <span className="sr-only">{fit ? 'Eligible' : 'Not eligible'}</span>
    </span>
  );
}
