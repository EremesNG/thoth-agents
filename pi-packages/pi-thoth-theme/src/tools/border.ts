export type BorderTone = 'error' | 'success' | 'accent';

export interface BorderState {
  isError?: boolean;
  isSuccess?: boolean;
}

export function getBorderTone(state: BorderState): BorderTone {
  return state.isError ? 'error' : state.isSuccess ? 'success' : 'accent';
}

/** Pi supplies the updated lifecycle to both call and result renderers. */
export function getToolBorderTone(context?: {
  isError?: boolean;
  isPartial?: boolean;
}): BorderTone {
  return getBorderTone({
    isError: context?.isError,
    isSuccess: !context?.isPartial,
  });
}
